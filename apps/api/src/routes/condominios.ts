import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { registrarAuditoria } from '../services/auditoriaService.js'

const CreateCondominioBody = z.object({
  nome: z.string().min(2),
  cnpj: z.string().optional(),
  endereco: z.string().optional(),
  cidade: z.string().optional(),
  estado: z.string().length(2).optional(),
  cep: z.string().optional(),
})

const UpdateCondominioBody = CreateCondominioBody.partial().extend({
  ativo: z.boolean().optional(),
})

const condominiosRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/condominios', async (request, reply) => {
    const rows = await request.tenantDb!.unsafe(
      `SELECT * FROM condominios ORDER BY nome`
    )
    return reply.status(200).send({ data: rows })
  })

  fastify.get('/condominios/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await request.tenantDb!.unsafe(`SELECT * FROM condominios WHERE id = $1`, [id])
    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Condomínio não encontrado' },
      })
    }
    return reply.status(200).send({ data: rows[0] })
  })

  fastify.post('/condominios', async (request, reply) => {
    const parsed = CreateCondominioBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { nome, cnpj, endereco, cidade, estado, cep } = parsed.data
    const id = uuidv4()

    const rows = await request.tenantDb!.unsafe(
      `INSERT INTO condominios (id, nome, cnpj, endereco, cidade, estado, cep)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, nome, cnpj ?? null, endereco ?? null, cidade ?? null, estado ?? null, cep ?? null]
    )

    await registrarAuditoria(request.tenantDb!, {
      usuario_id: (request.user as any).sub,
      acao: 'INSERT',
      tabela: 'condominios',
      registro_id: id,
      dados_depois: rows[0] as Record<string, unknown>,
      ip: request.ip,
    })

    return reply.status(201).send({ data: rows[0] })
  })

  fastify.patch('/condominios/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateCondominioBody.safeParse(request.body)
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
    updates.push(`atualizado_em = NOW()`)

    const rows = await request.tenantDb!.unsafe(
      `UPDATE condominios SET ${updates.join(', ')} WHERE id = $${params.push(id)} RETURNING *`,
      params
    )
    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Condomínio não encontrado' },
      })
    }

    await registrarAuditoria(request.tenantDb!, {
      usuario_id: (request.user as any).sub,
      acao: 'UPDATE',
      tabela: 'condominios',
      registro_id: id,
      dados_depois: rows[0] as Record<string, unknown>,
      ip: request.ip,
    })

    return reply.status(200).send({ data: rows[0] })
  })
}

export default condominiosRoutes
