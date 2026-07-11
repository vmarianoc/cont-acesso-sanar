import { createServer } from 'node:http'
import pino from 'pino'
import { carregarConfig, type DispositivoEdge } from './config.js'
import { CloudClient, fingerprint } from './cloud.js'
import { extrairPlaca } from './anpr.js'
import { abrirAcesso, aplicarComando, assinarEventosFacial } from './intelbras.js'
import { Store } from './store.js'

const log = pino({ name: 'edge' })

async function main() {
  const cfg = carregarConfig()
  const cloud = new CloudClient(cfg)
  const store = new Store(process.env.EDGE_STATE ?? 'edge.state.json')

  // 1) Licença: valida no boot com o fingerprint deste hardware. Falha de
  // rede não derruba o Edge (modo degradado) — licença inválida sim.
  try {
    const lic = await cloud.validarLicenca()
    log.info({ plano: lic.plano, fingerprint: fingerprint() }, 'licença validada')
  } catch (err) {
    const msg = (err as Error).message
    if (/inválida|outro hardware/i.test(msg)) throw err
    log.warn({ err: msg }, 'Cloud indisponível no boot — iniciando em modo degradado')
  }

  const decidirLpr = async (dev: DispositivoEdge, placa: string) => {
    try {
      const r = await cloud.validarPlaca(dev.dispositivo_id, placa)
      log.info({ dev: dev.nome, placa, resultado: r.resultado, motivo: r.motivo }, 'LPR decidido pela Cloud')
      if (r.resultado === 'liberado') await abrirAcesso(dev)
      return r
    } catch (err) {
      // Modo degradado: decide pelo cache local de placas de moradores ativos
      const pessoaId = store.placaAutorizadaLocal(placa)
      const resultado = pessoaId ? 'liberado' : 'negado'
      log.warn({ dev: dev.nome, placa, resultado, err: (err as Error).message }, 'LPR em modo degradado')
      if (pessoaId) await abrirAcesso(dev)
      store.enfileirarEvento({
        dispositivo_id: dev.dispositivo_id,
        pessoa_id: pessoaId ?? undefined,
        tipo: 'acesso_area',
        resultado,
        metodo: 'placa',
        ocorrido_em: new Date().toISOString(),
      })
      return { resultado, motivo: 'MODO_DEGRADADO' }
    }
  }

  // 2) Listener dos pushes ANPR das câmeras LPR
  const porIp = new Map(cfg.dispositivos.map((d) => [d.ip, d]))
  const lprDevs = cfg.dispositivos.filter((d) => d.tipo === 'lpr')
  const server = createServer((req, res) => {
    let corpo = ''
    req.on('data', (c) => (corpo += c))
    req.on('end', async () => {
      res.writeHead(200).end('OK')
      const placa = extrairPlaca(corpo)
      if (!placa) return
      const origem = (req.socket.remoteAddress ?? '').replace('::ffff:', '')
      const dev = porIp.get(origem) ?? lprDevs[0]
      if (!dev) return log.warn({ origem, placa }, 'push ANPR sem dispositivo LPR configurado')
      await decidirLpr(dev, placa)
    })
  })
  server.listen(cfg.lpr_listen_port, () =>
    log.info({ porta: cfg.lpr_listen_port, cameras: lprDevs.length }, 'listener ANPR no ar')
  )

  // 3) Eventos dos controladores faciais → validação/registro na Cloud
  const paradas: Array<() => void> = []
  for (const dev of cfg.dispositivos.filter((d) => d.tipo === 'facial')) {
    paradas.push(
      assinarEventosFacial(dev, async (pessoaId) => {
        try {
          const r = await cloud.validarFacial(dev.dispositivo_id, pessoaId)
          log.info({ dev: dev.nome, pessoaId, resultado: r.resultado }, 'facial registrado na Cloud')
        } catch {
          store.enfileirarEvento({
            dispositivo_id: dev.dispositivo_id,
            pessoa_id: pessoaId,
            tipo: 'acesso_area',
            resultado: 'liberado', // o controlador decidiu localmente
            metodo: 'facial',
            ocorrido_em: new Date().toISOString(),
          })
        }
      })
    )
  }

  // 4) Loop de sincronização: comandos → equipamentos, fila offline → Cloud,
  //    heartbeat por dispositivo
  const sincronizar = async () => {
    try {
      store.atualizarPlacas(await cloud.buscarPlacas())
    } catch {
      /* mantém o cache anterior */
    }
    for (const dev of cfg.dispositivos) {
      try {
        const comandos = await cloud.buscarComandos(dev.dispositivo_id)
        for (const cmd of comandos) {
          const ok = dev.tipo === 'facial' ? await aplicarComando(dev, cmd) : true
          await cloud.ackComando(cmd.id, ok)
          log.info({ dev: dev.nome, tipo: cmd.tipo_comando, ok }, 'comando processado')
        }
        await cloud.heartbeat(dev.dispositivo_id, 'online')
      } catch (err) {
        log.warn({ dev: dev.nome, err: (err as Error).message }, 'sync falhou (Cloud offline?)')
      }
    }
    const pendentes = store.eventosPendentes()
    if (pendentes.length > 0) {
      try {
        await cloud.enviarEventos(pendentes)
        store.limparEventos(pendentes.length)
        log.info({ qtd: pendentes.length }, 'eventos offline sincronizados')
      } catch {
        /* segue acumulando */
      }
    }
  }
  sincronizar()
  const timer = setInterval(sincronizar, cfg.sync_seg * 1000)

  const encerrar = () => {
    log.info('encerrando Edge')
    clearInterval(timer)
    paradas.forEach((p) => p())
    server.close(() => process.exit(0))
    setTimeout(() => process.exit(0), 3000)
  }
  process.on('SIGINT', encerrar)
  process.on('SIGTERM', encerrar)
}

main().catch((err) => {
  log.error({ err: err.message }, 'falha fatal no boot do Edge')
  process.exit(1)
})
