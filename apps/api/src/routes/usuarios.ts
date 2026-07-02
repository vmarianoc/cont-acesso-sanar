import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { hashPassword } from '../services/authService.js'
import { registrarAuditoria } from '../services/auditoriaService.js'

const PERFIS_GESTAO = new Set(['admin', 'sindico', 'superadmin'])
const PERFIS_CRIAVEIS = ['sindico', 'porteiro', 'morador', 'admin'] as const

const CreateUsuarioBody = z.object({
  email: z.string().email(),
  senha: z.string().min(6),
  perfil: z.enum(PERFIS_CRIAVEIS),
  pessoa_id: z.string().uuid().optional(),
})

const UpdateUsuarioBody = z.object({
  perfil: z.enum(PERFIS_CRIAVEIS).optional(),
  ativo: z.boolean().optional(),
})

const usuariosRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.addHook('preHandler', async (request, reply) => {
    const perfil = (request.user as any).perfil as string
    if (!PERFIS_GESTAO.has(perfil)) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas síndico ou administrador podem gerenciar usuários' },
      })
    }
  })

  fastify.get('/usuarios', async (request, reply) => {
    const rows = await request.tenantDb!.unsafe(
      `SELECT ut.id, ut.email, ut.perfil, ut.ativo, ut.mfa_ativo, ut.criado_em,
              ut.pessoa_id, p.nome AS pessoa_nome
       FROM usuarios_tenant ut
       LEFT JOIN pessoas p ON p.id = ut.pessoa_id
       ORDER BY ut.ativo DESC, ut.perfil, ut.email`
    )
    return reply.status(200).send({ data: rows })
  })

  fastify.post('/usuarios', async (request, reply) => {
    const parsed = CreateUsuarioBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { email, senha, perfil, pessoa_id } = parsed.data
    const db = request.tenantDb!

    const dup = await db.unsafe(`SELECT id FROM usuarios_tenant WHERE email = $1`, [email])
    if (dup.length > 0) {
      return reply.status(409).send({
        erro: { codigo: 'EMAIL_DUPLICADO', mensagem: 'Já existe um usuário com esse e-mail' },
      })
    }

    if (pessoa_id) {
      const pessoa = await db.unsafe(`SELECT id FROM pessoas WHERE id = $1`, [pessoa_id])
      if (pessoa.length === 0) {
        return reply.status(400).send({
          erro: { codigo: 'PESSOA_INVALIDA', mensagem: 'Pessoa não encontrada' },
        })
      }
    }

    const id = uuidv4()
    const rows = await db.unsafe(
      `INSERT INTO usuarios_tenant (id, pessoa_id, email, senha_hash, perfil)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, perfil, ativo, pessoa_id, criado_em`,
      [id, pessoa_id ?? null, email, await hashPassword(senha), perfil]
    )

    await registrarAuditoria(db, {
      usuario_id: (request.user as any).sub,
      acao: 'INSERT',
      tabela: 'usuarios_tenant',
      registro_id: id,
      dados_depois: { email, perfil, pessoa_id: pessoa_id ?? null },
      ip: request.ip,
    })

    return reply.status(201).send({ data: rows[0] })
  })

  fastify.patch('/usuarios/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateUsuarioBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    if (id === (request.user as any).sub && parsed.data.ativo === false) {
      return reply.status(400).send({
        erro: { codigo: 'AUTO_DESATIVACAO', mensagem: 'Você não pode desativar o próprio usuário' },
      })
    }

    const updates: string[] = []
    const params: any[] = []
    for (const [campo, valor] of Object.entries(parsed.data)) {
      if (valor !== undefined) updates.push(`${campo} = $${params.push(valor)}`)
    }
    if (updates.length === 0) {
      return reply.status(400).send({
        erro: { codigo: 'SEM_ALTERACOES', mensagem: 'Nenhum campo para atualizar' },
      })
    }
    updates.push(`atualizado_em = NOW()`)

    const rows = await request.tenantDb!.unsafe(
      `UPDATE usuarios_tenant SET ${updates.join(', ')}
       WHERE id = $${params.push(id)}
       RETURNING id, email, perfil, ativo, pessoa_id`,
      params
    )
    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Usuário não encontrado' },
      })
    }

    await registrarAuditoria(request.tenantDb!, {
      usuario_id: (request.user as any).sub,
      acao: 'UPDATE',
      tabela: 'usuarios_tenant',
      registro_id: id,
      dados_depois: rows[0] as Record<string, unknown>,
      ip: request.ip,
    })

    return reply.status(200).send({ data: rows[0] })
  })
}

export default usuariosRoutes
