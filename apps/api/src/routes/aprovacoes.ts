import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

const CreateAprovacaoBody = z.object({
  pessoa_id: z.string().uuid(),
  unidade_id: z.string().uuid(),
  tipo: z.string().min(1),
  dados: z.record(z.unknown()).default({}),
})

const UpdateAprovacaoBody = z.object({
  status: z.enum(['aprovado', 'rejeitado']),
  observacao: z.string().optional(),
})

const aprovacoesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/aprovacoes', async (request, reply) => {
    const query = request.query as { status?: string; page?: string; limit?: string }
    const page = Math.max(1, parseInt(query.page ?? '1', 10))
    const limit = Math.min(100, parseInt(query.limit ?? '20', 10))
    const offset = (page - 1) * limit

    const rows = query.status
      ? await fastify.db.unsafe(
          `SELECT * FROM aprovacoes WHERE status = $1 ORDER BY criado_em DESC LIMIT ${limit} OFFSET ${offset}`,
          [query.status]
        )
      : await fastify.db.unsafe(
          `SELECT * FROM aprovacoes ORDER BY criado_em DESC LIMIT ${limit} OFFSET ${offset}`
        )

    return reply.status(200).send({ data: rows })
  })

  fastify.post('/aprovacoes', async (request, reply) => {
    const parsed = CreateAprovacaoBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const { pessoa_id, unidade_id, tipo, dados } = parsed.data
    const id = uuidv4()

    const rows = await fastify.db.unsafe(
      `INSERT INTO aprovacoes (id, pessoa_id, unidade_id, tipo, dados)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, pessoa_id, unidade_id, tipo, JSON.stringify(dados)]
    )

    return reply.status(201).send({ data: rows[0] })
  })

  fastify.patch('/aprovacoes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateAprovacaoBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const { status, observacao } = parsed.data
    const aprovador_id = (request as any).user.sub

    const rows = await fastify.db.unsafe(
      `UPDATE aprovacoes
       SET status = $1, atualizado_em = NOW()
       WHERE id = $2
       RETURNING *`,
      [status, id]
    )

    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Aprovação não encontrada' },
      })
    }

    await fastify.db.unsafe(
      `INSERT INTO historico_aprovacoes (id, aprovacao_id, status, aprovador_id, observacao)
       VALUES ($1, $2, $3, $4, $5)`,
      [uuidv4(), id, status, aprovador_id, observacao ?? null]
    )

    return reply.status(200).send({ data: rows[0] })
  })
}

export default aprovacoesRoutes
