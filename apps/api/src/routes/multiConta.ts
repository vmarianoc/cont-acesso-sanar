import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { login } from '../services/authService.js'
import { registrarAuditoria } from '../services/auditoriaService.js'

const ContasBody = z
  .object({
    identificador: z.string().min(3).optional(),
    email: z.string().email().optional(),
    senha: z.string().min(6),
  })
  .refine((b) => b.identificador || b.email, { message: 'Informe e-mail ou CPF' })

const TrocarBody = z.object({
  tenant_id: z.string().uuid(),
})

/**
 * Usuário com contas em vários condomínios (tenants) — mesmo e-mail:
 * - POST /auth/contas: email+senha → lista os condomínios onde a credencial
 *   vale. Alimenta o seletor de condomínio no login.
 * - POST /auth/trocar-condominio: já autenticado, troca para outro tenant em
 *   que o mesmo e-mail tenha usuário ativo, sem redigitar a senha.
 */
const multiContaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/auth/contas', async (request, reply) => {
    const parsed = ContasBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const email = (parsed.data.identificador ?? parsed.data.email)!.trim()
    const { senha } = parsed.data

    const tenants = await fastify.db.unsafe(
      `SELECT id, nome FROM tenants WHERE ativo = true ORDER BY nome`
    )

    const contas: { tenant_id: string; condominio: string }[] = []
    for (const t of tenants as any[]) {
      const result = await login(fastify.db, email, senha, t.id)
      // MFA pendente ainda é credencial válida para fins de listagem
      if (result.ok || (!result.ok && result.code === 'MFA_REQUERIDO')) {
        contas.push({ tenant_id: t.id, condominio: t.nome })
      }
    }

    return reply.status(200).send({ data: contas })
  })

  fastify.post(
    '/auth/trocar-condominio',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const parsed = TrocarBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({
          erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
        })
      }
      const alvoTenantId = parsed.data.tenant_id
      const atual = request.user as any

      if (alvoTenantId === atual.tenant_id) {
        return reply.status(400).send({
          erro: { codigo: 'MESMO_TENANT', mensagem: 'Você já está neste condomínio' },
        })
      }

      // e-mail do usuário no tenant atual (identidade âncora da troca)
      const [eu] = await fastify.withTenant(atual.schema_name, (sql) =>
        sql.unsafe(`SELECT email FROM usuarios_tenant WHERE id = $1 AND ativo = true`, [atual.sub])
      )
      if (!eu) {
        return reply.status(401).send({
          erro: { codigo: 'USUARIO_INATIVO', mensagem: 'Conta atual inativa' },
        })
      }

      const [tenantAlvo] = await fastify.db.unsafe(
        `SELECT id, nome, schema_name FROM tenants WHERE id = $1 AND ativo = true`,
        [alvoTenantId]
      )
      if (!tenantAlvo) {
        return reply.status(404).send({
          erro: { codigo: 'TENANT_INEXISTENTE', mensagem: 'Condomínio não encontrado' },
        })
      }

      const [destino] = await fastify.withTenant(tenantAlvo.schema_name, (sql) =>
        sql.unsafe(`SELECT id, perfil FROM usuarios_tenant WHERE email = $1 AND ativo = true`, [eu.email])
      )
      if (!destino) {
        return reply.status(403).send({
          erro: { codigo: 'SEM_CONTA_NO_TENANT', mensagem: 'Você não tem conta ativa neste condomínio' },
        })
      }

      const payload = {
        sub: destino.id,
        tenant_id: tenantAlvo.id,
        perfil: destino.perfil,
        schema_name: tenantAlvo.schema_name,
      }
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

      await fastify.withTenant(tenantAlvo.schema_name, (sql) =>
        registrarAuditoria(sql, {
          usuario_id: destino.id,
          acao: 'conta.trocar_condominio',
          tabela: 'usuarios_tenant',
          registro_id: destino.id,
          dados_antes: { de_tenant: atual.tenant_id },
          ip: request.ip,
        })
      )

      return reply.status(200).send({
        data: { token, perfil: destino.perfil, condominio: tenantAlvo.nome, tenant_id: tenantAlvo.id },
      })
    }
  )
}

export default multiContaRoutes
