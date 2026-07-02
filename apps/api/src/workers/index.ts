import 'dotenv/config'
import { startNotificacoesWorker } from './notificacoes.js'

const { shutdown } = startNotificacoesWorker()

console.log('Workers iniciados: notificacoes')

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await shutdown()
    process.exit(0)
  })
}
