import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { registrarAuditoria } from '../services/auditoriaService.js'

const CreateBlocoBody = z.object({
  condominio_id: z.string().uuid(),
  nome: z.string().min(1),
})

const UpdateBlocoBody = z.object({
  nome: z.string().min(1).optional(),
  ativo: z.boolean().optional(),
})

const blocosRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/blocos', async (request, reply) => {
    const query = request.query as { condominio_id?: string }
    const rows = query.condominio_id
      ? await request.tenantDb!.unsafe(
          `SELECT * FROM blocos WHERE condominio_id = $1 ORDER BY nome`,
          [query.condominio_id]
        )
      : await request.tenantDb!.unsafe(`SELECT * FROM blocos ORDER BY nome`)
    return reply.status(200).send({ data: rows })
  })

  fastify.post('/blocos', async (request, reply) => {
    const parsed = CreateBlocoBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { condominio_id, nome } = parsed.data
    const id = uuidv4()

    const cond = await request.tenantDb!.unsafe(`SELECT id FROM condominios WHERE id = $1`, [
      condominio_id,
    ])
    if (cond.length === 0) {
      return reply.status(400).send({
        erro: { codigo: 'CONDOMINIO_INVALIDO', mensagem: 'Condomínio não encontrado' },
      })
    }

    const rows = await request.tenantDb!.unsafe(
      `INSERT INTO blocos (id, condominio_id, nome) VALUES ($1, $2, $3) RETURNING *`,
      [id, condominio_id, nome]
    )

    await registrarAuditoria(request.tenantDb!, {
      usuario_id: (request.user as any).sub,
      acao: 'INSERT',
      tabela: 'blocos',
      registro_id: id,
      dados_depois: rows[0] as Record<string, unknown>,
      ip: request.ip,
    })

    return reply.status(201).send({ data: rows[0] })
  })

  fastify.patch('/blocos/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateBlocoBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
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

    const rows = await request.tenantDb!.unsafe(
      `UPDATE blocos SET ${updates.join(', ')} WHERE id = $${params.push(id)} RETURNING *`,
      params
    )
    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Bloco não encontrado' },
      })
    }

    await registrarAuditoria(request.tenantDb!, {
      usuario_id: (request.user as any).sub,
      acao: 'UPDATE',
      tabela: 'blocos',
      registro_id: id,
      dados_depois: rows[0] as Record<string, unknown>,
      ip: request.ip,
    })

    return reply.status(200).send({ data: rows[0] })
  })
}

export default blocosRoutes
