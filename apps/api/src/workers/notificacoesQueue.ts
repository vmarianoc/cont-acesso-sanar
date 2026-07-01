import { Queue } from 'bullmq'

export const NOTIFICACOES_QUEUE = 'notificacoes'

export interface NotificacaoJob {
  schema_name: string
  pessoa_id: string
  titulo: string
  mensagem: string
  tipo: string
  dados?: Record<string, unknown>
}

function redisConnection() {
  const url = new URL(process.env.REDIS_URL ?? 'redis://localhost:6379')
  return {
    host: url.hostname,
    port: parseInt(url.port || '6379', 10),
    password: url.password || undefined,
  }
}

let queue: Queue<NotificacaoJob> | null = null

export function getNotificacoesQueue(): Queue<NotificacaoJob> {
  if (!queue) {
    queue = new Queue<NotificacaoJob>(NOTIFICACOES_QUEUE, {
      connection: redisConnection(),
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      },
    })
  }
  return queue
}

export async function enqueueNotificacao(job: NotificacaoJob): Promise<void> {
  await getNotificacoesQueue().add('enviar', job)
}

export { redisConnection }
