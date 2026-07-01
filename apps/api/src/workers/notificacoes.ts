import { Worker } from 'bullmq'
import pino from 'pino'
import {
  NOTIFICACOES_QUEUE,
  redisConnection,
  type NotificacaoJob,
} from './notificacoesQueue.js'

const log = pino({ name: 'notificacoes-worker' })

export function startNotificacoesWorker() {
  const worker = new Worker<NotificacaoJob>(
    NOTIFICACOES_QUEUE,
    async (job) => {
      const { schema_name, pessoa_id, titulo, mensagem, tipo } = job.data

      // Stub de entrega: aqui entraria a integração real com FCM (Android) / APNs (iOS).
      // A notificação já foi persistida na tabela `notificacoes` pela rota; este worker
      // representa o disparo do push para os dispositivos registrados do morador.
      log.info(
        { schema_name, pessoa_id, titulo, tipo, mensagem },
        'push enviado (stub FCM/APNs)'
      )

      return { entregue: true }
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
    },
  }
}
