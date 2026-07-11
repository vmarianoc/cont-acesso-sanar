import { Worker } from 'bullmq'
import pino from 'pino'
import postgres from 'postgres'
import { enviarPushFcm, pushConfigurado } from '../services/pushService.js'
import {
  NOTIFICACOES_QUEUE,
  redisConnection,
  type NotificacaoJob,
} from './notificacoesQueue.js'

const log = pino({ name: 'notificacoes-worker' })

export function startNotificacoesWorker() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 2 })

  const worker = new Worker<NotificacaoJob>(
    NOTIFICACOES_QUEUE,
    async (job) => {
      const { schema_name, pessoa_id, titulo, mensagem, tipo, dados } = job.data

      // A notificação já foi persistida em `notificacoes` pela rota; aqui é o
      // disparo do push (FCM HTTP v1) para os dispositivos registrados da pessoa.
      const tokens = await sql.unsafe(
        `SELECT token FROM ${schema_name}.push_tokens WHERE pessoa_id = $1`,
        [pessoa_id]
      )
      if (tokens.length === 0 || !pushConfigurado()) {
        log.info(
          { schema_name, pessoa_id, titulo, tipo, tokens: tokens.length, fcm: pushConfigurado() },
          tokens.length === 0 ? 'sem tokens de push registrados' : 'push em modo stub (sem credenciais FCM)'
        )
        return { entregue: true, enviados: 0 }
      }

      let enviados = 0
      for (const { token } of tokens) {
        const resultado = await enviarPushFcm({ token, titulo, mensagem, dados: { ...dados, tipo } })
        if (resultado === 'enviado') enviados++
        if (resultado === 'token_invalido') {
          await sql.unsafe(`DELETE FROM ${schema_name}.push_tokens WHERE token = $1`, [token])
          log.info({ schema_name, pessoa_id }, 'token de push expirado removido')
        }
      }
      log.info({ schema_name, pessoa_id, titulo, tipo, enviados, total: tokens.length }, 'push processado')
      return { entregue: true, enviados }
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
