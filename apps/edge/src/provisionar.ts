import pino from 'pino'
import { networkInterfaces } from 'node:os'
import { carregarConfig } from './config.js'
import { configurarEventServer } from './intelbras.js'

const log = pino({ name: 'edge-provisionar' })

/**
 * Provisiona os controladores faciais do config: configura o Event Server
 * BioT para empurrar eventos para este Edge. Rode uma vez por equipamento:
 *   npm run provisionar            (usa o primeiro IP local)
 *   EDGE_HOST=192.168.1.50 npm run provisionar
 */
function ipLocal(): string {
  for (const ifaces of Object.values(networkInterfaces())) {
    for (const i of ifaces ?? []) {
      if (i.family === 'IPv4' && !i.internal) return i.address
    }
  }
  return '127.0.0.1'
}

const cfg = carregarConfig()
const host = process.env.EDGE_HOST ?? ipLocal()
const faciais = cfg.dispositivos.filter((d) => d.tipo === 'facial')
if (faciais.length === 0) {
  log.warn('nenhum dispositivo facial no edge.config.json')
  process.exit(0)
}
for (const dev of faciais) {
  const ok = await configurarEventServer(dev, host, cfg.lpr_listen_port)
  log.info({ dev: dev.nome, ip: dev.ip, destino: `${host}:${cfg.lpr_listen_port}`, ok }, 'provisionamento do Event Server')
}
