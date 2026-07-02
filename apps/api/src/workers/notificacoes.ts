import { Worker } from 'bullmq'
import postgres from 'postgres'
import pino from 'pino'
import {
  NOTIFICACOES_QUEUE,
  redisConnection,
  type NotificacaoJob,
} from './notificacoesQueue.js'
import { withTenant } from '../services/tenantDb.js'
import { enviarPush } from '../services/pushService.js'

const log = pino({ name: 'notificacoes-worker' })

export function startNotificacoesWorker() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 5, onnotice: () => {} })

  const worker = new Worker<NotificacaoJob>(
    NOTIFICACOES_QUEUE,
    async (job) => {
      const { schema_name, pessoa_id, titulo, mensagem, tipo, dados } = job.data

      const tokens = await withTenant(sql, schema_name, (db) =>
        db.unsafe<{ token: string }[]>(
          `SELECT token FROM dispositivos_push WHERE pessoa_id = $1 AND ativo = true`,
          [pessoa_id]
        )
      )

      const resultado = await enviarPush({
        tokens: tokens.map((t) => t.token),
        titulo,
        corpo: mensagem,
        fotoUrl: (dados?.foto_url as string | undefined) ?? null,
        dados: { tipo, ...dados },
      })

      if (resultado.tokensInvalidos.length > 0) {
        await withTenant(sql, schema_name, (db) =>
          db.unsafe(`UPDATE dispositivos_push SET ativo = false WHERE token = ANY($1)`, [
            resultado.tokensInvalidos,
          ])
        )
      }

      log.info(
        { schema_name, pessoa_id, titulo, tipo, ...resultado },
        resultado.modo === 'fcm' ? 'push enviado via FCM' : 'push não enviado (modo stub — sem FCM configurado ou sem tokens)'
      )

      return resultado
    },
    { connection: redisConnection(), concurrency: 5 }
  )

  worker.on('failed', (job, err) => {
    log.error({ jobId: job?.id, err: err.message }, 'falha ao processar notificação')
  })

  return {
    worker,
    shutdown: async () => {
      await worker.close()
      await sql.end({ timeout: 5 })
    },
  }
}
