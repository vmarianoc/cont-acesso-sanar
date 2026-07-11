import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { authenticator } from 'otplib'
import { login, refresh } from '../services/authService.js'

const LoginBody = z
  .object({
    identificador: z.string().min(3).optional(), // e-mail ou CPF
    email: z.string().email().optional(), // compat
    senha: z.string().min(6),
    tenant_id: z.string().uuid().optional(),
    codigo_condominio: z.string().min(4).max(12).optional(), // login da portaria
    mfa_code: z.string().optional(),
  })
  .refine((b) => b.identificador || b.email, { message: 'Informe e-mail ou CPF' })

const EnableMfaBody = z.object({
  codigo: z.string().min(6),
})

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/auth/login', async (request, reply) => {
    const parsed = LoginBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const { senha, mfa_code, codigo_condominio } = parsed.data
    const identificador = (parsed.data.identificador ?? parsed.data.email)!.trim()
    let tenant_id = parsed.data.tenant_id

    // Portaria entra com o código curto do condomínio (não com UUID)
    if (!tenant_id && codigo_condominio) {
      const [t] = await fastify.db.unsafe(
        `SELECT id FROM public.tenants WHERE UPPER(codigo) = UPPER($1) AND ativo = true`,
        [codigo_condominio.trim()]
      )
      if (!t) {
        return reply.status(401).send({
          erro: { codigo: 'CONDOMINIO_INVALIDO', mensagem: 'Código de condomínio não encontrado' },
        })
      }
      tenant_id = t.id
    }

    // Morador/síndico não digitam condomínio: descobrimos pela credencial.
    if (!tenant_id) {
      const tenants = await fastify.db.unsafe(
        `SELECT id, nome FROM public.tenants WHERE ativo = true ORDER BY nome`
      )
      const contas: { tenant_id: string; condominio: string }[] = []
      for (const t of tenants as any[]) {
        const r = await login(fastify.db, identificador, senha, t.id)
        if (r.ok || (!r.ok && r.code === 'MFA_REQUERIDO')) {
          contas.push({ tenant_id: t.id, condominio: t.nome })
        }
      }
      if (contas.length === 0) {
        return reply.status(401).send({
          erro: { codigo: 'CREDENCIAIS_INVALIDAS', mensagem: 'E-mail/CPF ou senha inválidos' },
        })
      }
      if (contas.length > 1) {
        return reply.status(409).send({
          erro: { codigo: 'CONTAS_MULTIPLAS', mensagem: 'Escolha o condomínio' },
          data: { contas },
        })
      }
      tenant_id = contas[0].tenant_id
    }

    const result = await login(fastify.db, identificador, senha, tenant_id, mfa_code)

    if (!result.ok) {
      if (result.code === 'MFA_REQUERIDO') {
        return reply.status(401).send({
          erro: { codigo: 'MFA_REQUERIDO', mensagem: 'Código MFA obrigatório para este perfil' },
        })
      }
      if (result.code === 'MFA_INVALIDO') {
        return reply.status(401).send({
          erro: { codigo: 'MFA_INVALIDO', mensagem: 'Código MFA inválido' },
        })
      }
      return reply.status(401).send({
        erro: { codigo: 'CREDENCIAIS_INVALIDAS', mensagem: 'E-mail/CPF, senha ou condomínio inválidos' },
      })
    }

    const payload = result.payload
    const token = fastify.jwt.sign(payload)
    const refreshToken = fastify.jwt.sign(
      { sub: payload.sub, tenant_id: payload.tenant_id, schema_name: payload.schema_name },
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d' }
    )

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 60 * 60 * 24 * 7,
    })

    const [tenantInfo] = await fastify.db.unsafe(
      `SELECT nome, codigo FROM public.tenants WHERE id = $1`,
      [tenant_id]
    )
    return reply.status(200).send({
      data: {
        token,
        perfil: payload.perfil,
        tenant_id,
        condominio: tenantInfo?.nome ?? null,
        codigo_condominio: tenantInfo?.codigo ?? null,
      },
    })
  })

  fastify.post('/auth/refresh', async (request, reply) => {
    const refreshToken = request.cookies?.refreshToken
    if (!refreshToken) {
      return reply.status(401).send({
        erro: { codigo: 'SEM_REFRESH_TOKEN', mensagem: 'Refresh token não encontrado' },
      })
    }

    let decoded: any
    try {
      decoded = fastify.jwt.verify(refreshToken)
    } catch {
      return reply.status(401).send({
        erro: { codigo: 'REFRESH_INVALIDO', mensagem: 'Refresh token inválido ou expirado' },
      })
    }

    const payload = await refresh(fastify.db, decoded.sub, decoded.tenant_id, decoded.schema_name)

    if (!payload) {
      return reply.status(401).send({
        erro: { codigo: 'USUARIO_INATIVO', mensagem: 'Usuário inativo ou não encontrado' },
      })
    }

    const token = fastify.jwt.sign(payload)
    return reply.status(200).send({ data: { token } })
  })

  fastify.post('/auth/logout', async (request, reply) => {
    reply.clearCookie('refreshToken', { path: '/auth/refresh' })
    return reply.status(200).send({ data: { mensagem: 'Logout realizado com sucesso' } })
  })

  fastify.post(
    '/auth/mfa/setup',
    { onRequest: fastify.authenticate },
    async (request, reply) => {
      const user = request.user as { sub: string; schema_name: string; perfil: string }
      const secret = authenticator.generateSecret()

      await fastify.withTenant(user.schema_name, async (sql) => {
        await sql.unsafe(`UPDATE usuarios_tenant SET mfa_secret = $1 WHERE id = $2`, [
          secret,
          user.sub,
        ])
      })

      const email = await fastify.withTenant(user.schema_name, async (sql) => {
        const rows = await sql.unsafe<{ email: string }[]>(
          `SELECT email FROM usuarios_tenant WHERE id = $1`,
          [user.sub]
        )
        return rows[0]?.email ?? user.sub
      })

      const otpauth = authenticator.keyuri(email, 'condar', secret)
      return reply.status(200).send({ data: { secret, otpauth } })
    }
  )

  fastify.post(
    '/auth/mfa/enable',
    { onRequest: fastify.authenticate },
    async (request, reply) => {
      const parsed = EnableMfaBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({
          erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
        })
      }

      const user = request.user as { sub: string; schema_name: string }

      const ok = await fastify.withTenant(user.schema_name, async (sql) => {
        const rows = await sql.unsafe<{ mfa_secret: string | null }[]>(
          `SELECT mfa_secret FROM usuarios_tenant WHERE id = $1`,
          [user.sub]
        )
        const secret = rows[0]?.mfa_secret
        if (!secret || !authenticator.check(parsed.data.codigo, secret)) return false
        await sql.unsafe(`UPDATE usuarios_tenant SET mfa_ativo = true WHERE id = $1`, [user.sub])
        return true
      })

      if (!ok) {
        return reply.status(400).send({
          erro: { codigo: 'MFA_INVALIDO', mensagem: 'Código inválido ou setup não iniciado' },
        })
      }

      return reply.status(200).send({ data: { mfa_ativo: true } })
    }
  )
}

export default authRoutes
