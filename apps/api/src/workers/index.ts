import 'dotenv/config'
import { startNotificacoesWorker } from './notificacoes.js'
import { startRetencaoWorker } from './retencao.js'

const { shutdown } = startNotificacoesWorker()
const retencao = startRetencaoWorker()

console.log('Workers iniciados: notificacoes, retencao')

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.on(sig, async () => {
    await shutdown()
    await retencao.shutdown()
    process.exit(0)
  })
}
