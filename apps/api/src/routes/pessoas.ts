import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { registrarAuditoria } from '../services/auditoriaService.js'

const CreatePessoaBody = z.object({
  nome: z.string().min(2),
  cpf: z.string().optional(),
  rg: z.string().optional(),
  foto_url: z.string().url().optional(),
  tipo: z.enum(['morador', 'funcionario', 'visitante', 'prestador']),
})

const pessoasRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/pessoas', async (request, reply) => {
    const query = request.query as { ativo?: string; tipo?: string; page?: string; limit?: string }
    const page = Math.max(1, parseInt(query.page ?? '1', 10))
    const limit = Math.min(100, parseInt(query.limit ?? '20', 10))
    const offset = (page - 1) * limit

    const conditions: string[] = []
    const params: any[] = []

    if (query.ativo !== undefined) {
      conditions.push(`ativo = $${params.push(query.ativo === 'true')}`)
    }
    if (query.tipo) {
      conditions.push(`tipo = $${params.push(query.tipo)}`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = await request.tenantDb!.unsafe(
      `SELECT * FROM pessoas ${where} ORDER BY nome LIMIT ${limit} OFFSET ${offset}`,
      params
    )

    return reply.status(200).send({ data: rows })
  })

  fastify.post('/pessoas', async (request, reply) => {
    const parsed = CreatePessoaBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const { nome, cpf, rg, foto_url, tipo } = parsed.data
    const id = uuidv4()

    const rows = await request.tenantDb!.unsafe(
      `INSERT INTO pessoas (id, nome, cpf, rg, foto_url, tipo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, nome, cpf ?? null, rg ?? null, foto_url ?? null, tipo]
    )

    await registrarAuditoria(request.tenantDb!, {
      usuario_id: (request.user as any).sub,
      acao: 'INSERT',
      tabela: 'pessoas',
      registro_id: id,
      dados_depois: rows[0] as Record<string, unknown>,
      ip: request.ip,
    })

    return reply.status(201).send({ data: rows[0] })
  })
}

export default pessoasRoutes
