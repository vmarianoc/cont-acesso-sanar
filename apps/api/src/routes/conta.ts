import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createHash, randomBytes } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { hashPassword } from '../services/authService.js'
import { enviarEmail } from '../services/mailService.js'
import { registrarAuditoria } from '../services/auditoriaService.js'

const PERFIS_GESTAO = new Set(['admin', 'sindico', 'superadmin'])

const EsqueciBody = z.object({
  email: z.string().email(),
  tenant_id: z.string().uuid(),
})

const RedefinirBody = z.object({
  tenant_id: z.string().uuid(),
  token: z.string().min(20),
  senha: z.string().min(6),
})

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const schemaDe = (tenantId: string) => `tenant_${tenantId.replace(/-/g, '_')}`

/**
 * Autosserviço de conta: esqueci-senha (token 1h) e convite de morador
 * (token 7 dias, morador define a própria senha). Tokens guardados como
 * sha256; respostas nunca revelam se o e-mail existe.
 */
const contaRoutes: FastifyPluginAsync = async (fastify) => {
  const consumirToken = async (
    sql: any,
    tipo: 'reset' | 'convite',
    token: string
  ): Promise<{ usuario_id: string; token_id: string } | null> => {
    const [row] = await sql.unsafe(
      `SELECT id, usuario_id FROM tokens_conta
       WHERE token_hash = $1 AND tipo = $2 AND usado_em IS NULL AND expira_em > NOW()`,
      [sha256(token), tipo]
    )
    if (!row) return null
    await sql.unsafe(`UPDATE tokens_conta SET usado_em = NOW() WHERE id = $1`, [row.id])
    return { usuario_id: row.usuario_id, token_id: row.id }
  }

  fastify.post('/auth/esqueci-senha', async (request, reply) => {
    const parsed = EsqueciBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { email, tenant_id } = parsed.data

    await fastify.withTenant(schemaDe(tenant_id), async (sql) => {
      const [usuario] = await sql.unsafe(
        `SELECT id, email FROM usuarios_tenant WHERE email = $1 AND ativo = true`,
        [email]
      )
      if (!usuario) return
      const token = randomBytes(32).toString('hex')
      await sql.unsafe(
        `INSERT INTO tokens_conta (id, usuario_id, tipo, token_hash, expira_em)
         VALUES ($1, $2, 'reset', $3, NOW() + INTERVAL '1 hour')`,
        [uuidv4(), usuario.id, sha256(token)]
      )
      await enviarEmail(
        {
          para: usuario.email,
          assunto: 'condar — redefinição de senha',
          texto: `Use o código abaixo para redefinir sua senha (válido por 1 hora):\n\n${token}`,
        },
        request.log
      )
    })

    // Sempre 200: não vaza a existência da conta.
    return reply.status(200).send({ data: { enviado: true } })
  })

  fastify.post('/auth/redefinir-senha', async (request, reply) => {
    const parsed = RedefinirBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { tenant_id, token, senha } = parsed.data

    const ok = await fastify.withTenant(schemaDe(tenant_id), async (sql) => {
      const consumo = await consumirToken(sql, 'reset', token)
      if (!consumo) return false
      const senhaHash = await hashPassword(senha)
      await sql.unsafe(`UPDATE usuarios_tenant SET senha_hash = $1 WHERE id = $2`, [
        senhaHash,
        consumo.usuario_id,
      ])
      await registrarAuditoria(sql, {
        usuario_id: consumo.usuario_id,
        acao: 'conta.redefinir_senha',
        tabela: 'usuarios_tenant',
        registro_id: consumo.usuario_id,
        ip: request.ip,
      })
      return true
    })

    if (!ok) {
      return reply.status(400).send({
        erro: { codigo: 'TOKEN_INVALIDO', mensagem: 'Código inválido ou expirado' },
      })
    }
    return reply.status(200).send({ data: { redefinida: true } })
  })

  fastify.post('/auth/aceitar-convite', async (request, reply) => {
    const parsed = RedefinirBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { tenant_id, token, senha } = parsed.data

    const ok = await fastify.withTenant(schemaDe(tenant_id), async (sql) => {
      const consumo = await consumirToken(sql, 'convite', token)
      if (!consumo) return false
      const senhaHash = await hashPassword(senha)
      await sql.unsafe(
        `UPDATE usuarios_tenant SET senha_hash = $1, ativo = true WHERE id = $2`,
        [senhaHash, consumo.usuario_id]
      )
      await registrarAuditoria(sql, {
        usuario_id: consumo.usuario_id,
        acao: 'conta.aceitar_convite',
        tabela: 'usuarios_tenant',
        registro_id: consumo.usuario_id,
        ip: request.ip,
      })
      return true
    })

    if (!ok) {
      return reply.status(400).send({
        erro: { codigo: 'TOKEN_INVALIDO', mensagem: 'Convite inválido ou expirado' },
      })
    }
    return reply.status(200).send({ data: { ativado: true } })
  })

  // Síndico gera convite para um usuário existente (rota autenticada).
  fastify.post('/usuarios/:id/convite', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const perfil = (request.user as any).perfil as string
    if (!PERFIS_GESTAO.has(perfil)) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas síndico ou administrador geram convites' },
      })
    }
    const { id } = request.params as { id: string }
    const [usuario] = await request.tenantDb!.unsafe(
      `SELECT id, email FROM usuarios_tenant WHERE id = $1`,
      [id]
    )
    if (!usuario) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Usuário não encontrado' },
      })
    }
    const token = randomBytes(32).toString('hex')
    await request.tenantDb!.unsafe(
      `INSERT INTO tokens_conta (id, usuario_id, tipo, token_hash, expira_em)
       VALUES ($1, $2, 'convite', $3, NOW() + INTERVAL '7 days')`,
      [uuidv4(), id, sha256(token)]
    )
    await enviarEmail(
      {
        para: usuario.email,
        assunto: 'condar — seu convite de acesso',
        texto: `Bem-vindo ao condar! Use o código abaixo para criar sua senha (válido por 7 dias):\n\n${token}`,
      },
      request.log
    )
    await registrarAuditoria(request.tenantDb!, {
      usuario_id: (request.user as any).sub,
      acao: 'conta.gerar_convite',
      tabela: 'usuarios_tenant',
      registro_id: id,
      ip: request.ip,
    })
    // token retorna na resposta para o síndico copiar/enviar por outro canal
    return reply.status(201).send({ data: { token, expira_em_dias: 7 } })
  })
}

export default contaRoutes
