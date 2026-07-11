import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

const EventoBody = z.object({
  dispositivo_id: z.string().uuid(),
  pessoa_id: z.string().uuid().optional(),
  tipo: z.string(),
  resultado: z.enum(['liberado', 'negado', 'erro']),
  metodo: z.enum(['facial', 'qrcode', 'biometria', 'manual', 'placa']),
  foto_url: z.string().url().optional(),
  ocorrido_em: z.string().datetime(),
})

const EventosSyncBody = z.object({
  tenant_id: z.string().uuid(),
  schema_name: z.string(),
  eventos: z.array(EventoBody),
})

const HeartbeatBody = z.object({
  dispositivo_id: z.string().uuid(),
  tenant_id: z.string().uuid(),
  schema_name: z.string(),
  versao_fw: z.string().optional(),
  status: z.enum(['online', 'degradado']),
})

const edgeSyncRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.post('/edge/sync/eventos', async (request, reply) => {
    const parsed = EventosSyncBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const { schema_name, eventos } = parsed.data

    const inserted = await fastify.withTenant(schema_name, async (sql) => {
      const rows: unknown[] = []
      for (const ev of eventos) {
        const id = uuidv4()
        const result = await sql.unsafe(
          `INSERT INTO eventos (id, dispositivo_id, pessoa_id, tipo, resultado, metodo, foto_url, criado_em)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT DO NOTHING
           RETURNING *`,
          [
            id,
            ev.dispositivo_id,
            ev.pessoa_id ?? null,
            ev.tipo,
            ev.resultado,
            ev.metodo,
            ev.foto_url ?? null,
            ev.ocorrido_em,
          ]
        )
        if (result.length > 0) rows.push(result[0])
      }
      return rows
    })

    return reply.status(200).send({ data: { sincronizados: inserted.length } })
  })

  fastify.post('/edge/sync/heartbeat', async (request, reply) => {
    const parsed = HeartbeatBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const { dispositivo_id, schema_name, versao_fw, status } = parsed.data

    await fastify.withTenant(schema_name, async (sql) => {
      await sql.unsafe(
        `UPDATE sync_queue
         SET ultimo_heartbeat = NOW(), status_dispositivo = $1, versao_fw = COALESCE($2, versao_fw)
         WHERE dispositivo_id = $3`,
        [status, versao_fw ?? null, dispositivo_id]
      )
    })

    return reply.status(200).send({ data: { recebido: true, servidor_em: new Date().toISOString() } })
  })

  fastify.get('/edge/sync/comandos', async (request, reply) => {
    const query = request.query as { dispositivo_id: string; schema_name: string }

    if (!query.dispositivo_id || !query.schema_name) {
      return reply.status(400).send({
        erro: { codigo: 'PARAMS_FALTANDO', mensagem: 'dispositivo_id e schema_name são obrigatórios' },
      })
    }

    const rows = await fastify.withTenant(query.schema_name, async (sql) => {
      return sql.unsafe(
        `SELECT * FROM sync_queue
         WHERE dispositivo_id = $1 AND executado = false
         ORDER BY criado_em ASC
         LIMIT 50`,
        [query.dispositivo_id]
      )
    })

    // sql.unsafe devolve jsonb como string — o Edge espera objeto
    const data = (rows as any[]).map((r) => ({
      ...r,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
    }))
    return reply.status(200).send({ data })
  })

  // Cache do modo degradado: placas de veículos ativos de moradores ativos
  fastify.get('/edge/sync/placas', async (request, reply) => {
    const query = request.query as { schema_name?: string }
    if (!query.schema_name) {
      return reply.status(400).send({
        erro: { codigo: 'PARAMS_FALTANDO', mensagem: 'schema_name é obrigatório' },
      })
    }
    const rows = await fastify.withTenant(query.schema_name, async (sql) => {
      return sql.unsafe(
        `SELECT v.placa, v.pessoa_id FROM veiculos v
         JOIN pessoas p ON p.id = v.pessoa_id
         JOIN vinculos_unidade vu ON vu.pessoa_id = p.id AND vu.ativo = true
         WHERE v.ativo = true AND p.ativo = true`
      )
    })
    const placas: Record<string, string> = {}
    for (const r of rows as any[]) placas[r.placa] = r.pessoa_id
    return reply.status(200).send({ data: placas })
  })

  // Ack do Edge: marca o comando como executado (ou incrementa tentativas em falha)
  fastify.post('/edge/sync/comandos/:id/ack', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = z
      .object({ schema_name: z.string(), sucesso: z.boolean().default(true) })
      .safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'Informe schema_name' },
      })
    }
    const rows = await fastify.withTenant(parsed.data.schema_name, async (sql) => {
      if (parsed.data.sucesso) {
        return sql.unsafe(
          `UPDATE sync_queue SET executado = true, executado_em = NOW() WHERE id = $1 RETURNING id`,
          [id]
        )
      }
      return sql.unsafe(
        `UPDATE sync_queue SET tentativas = tentativas + 1 WHERE id = $1 RETURNING id`,
        [id]
      )
    })
    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Comando não encontrado' },
      })
    }
    return reply.status(200).send({ data: { ok: true } })
  })
}

export default edgeSyncRoutes
