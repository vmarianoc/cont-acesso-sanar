import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { enqueueNotificacao } from '../workers/notificacoesQueue.js'

const TITULO_RESULTADO: Record<string, string> = {
  liberado: 'Acesso liberado',
  negado: 'Acesso negado',
}

const EventoBody = z.object({
  dispositivo_id: z.string().uuid(),
  pessoa_id: z.string().uuid().optional(),
  tipo: z.string(),
  resultado: z.enum(['liberado', 'negado', 'erro']),
  metodo: z.enum(['facial', 'qrcode', 'biometria', 'manual']),
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

    const paraNotificar: { pessoa_id: string; titulo: string; mensagem: string; foto_url: string | null }[] = []

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
        if (result.length === 0) continue
        rows.push(result[0])

        const titulo = TITULO_RESULTADO[ev.resultado]
        if (!ev.pessoa_id || !titulo) continue

        const mensagem = `${titulo} · método ${ev.metodo}`
        const fotoUrl = ev.foto_url ?? null
        await sql.unsafe(
          `INSERT INTO notificacoes (id, pessoa_id, titulo, mensagem, tipo, dados)
           VALUES ($1, $2, $3, $4, 'acesso', $5)`,
          [uuidv4(), ev.pessoa_id, titulo, mensagem, sql.json({ evento_id: id, foto_url: fotoUrl })]
        )
        paraNotificar.push({ pessoa_id: ev.pessoa_id, titulo, mensagem, foto_url: fotoUrl })
      }
      return rows
    })

    for (const n of paraNotificar) {
      try {
        await enqueueNotificacao({
          schema_name,
          pessoa_id: n.pessoa_id,
          titulo: n.titulo,
          mensagem: n.mensagem,
          tipo: 'acesso',
          dados: { foto_url: n.foto_url },
        })
      } catch (err) {
        request.log.warn({ err }, 'falha ao enfileirar notificação de acesso')
      }
    }

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

    return reply.status(200).send({ data: rows })
  })
}

export default edgeSyncRoutes
