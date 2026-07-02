import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

const CreateEventoBody = z.object({
  dispositivo_id: z.string().uuid(),
  pessoa_id: z.string().uuid().optional(),
  tipo: z.string().min(1).default('acesso'),
  resultado: z.enum(['liberado', 'negado', 'erro']).default('liberado'),
  metodo: z.enum(['facial', 'qrcode', 'biometria', 'manual']).default('manual'),
  foto_url: z.string().url().optional(),
})

const eventosRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/dispositivos', async (request, reply) => {
    const rows = await request.tenantDb!.unsafe(
      `SELECT id, nome, tipo, local, ativo FROM dispositivos WHERE ativo = true ORDER BY nome`
    )
    return reply.status(200).send({ data: rows })
  })

  fastify.get('/eventos', async (request, reply) => {
    const query = request.query as {
      resultado?: string
      page?: string
      limit?: string
    }
    const page = Math.max(1, parseInt(query.page ?? '1', 10))
    const limit = Math.min(100, parseInt(query.limit ?? '30', 10))
    const offset = (page - 1) * limit

    const conditions: string[] = []
    const params: any[] = []

    if (query.resultado) {
      conditions.push(`e.resultado = $${params.push(query.resultado)}`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = await request.tenantDb!.unsafe(
      `SELECT e.*,
              CASE WHEN p.id IS NULL THEN NULL
                   ELSE json_build_object('nome', p.nome, 'foto_url', p.foto_url)
              END AS pessoa
       FROM eventos e
       LEFT JOIN pessoas p ON p.id = e.pessoa_id
       ${where}
       ORDER BY e.criado_em DESC
       LIMIT ${limit} OFFSET ${offset}`,
      params
    )

    return reply.status(200).send({ data: rows })
  })

  fastify.post('/eventos', async (request, reply) => {
    const parsed = CreateEventoBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const { dispositivo_id, pessoa_id, tipo, resultado, metodo, foto_url } = parsed.data
    const id = uuidv4()

    const rows = await request.tenantDb!.unsafe(
      `INSERT INTO eventos (id, dispositivo_id, pessoa_id, tipo, resultado, metodo, foto_url)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [id, dispositivo_id, pessoa_id ?? null, tipo, resultado, metodo, foto_url ?? null]
    )

    return reply.status(201).send({ data: rows[0] })
  })
}

export default eventosRoutes
