import { createServer } from 'node:http'
import pino from 'pino'
import { carregarConfig, type DispositivoEdge } from './config.js'
import { CloudClient, fingerprint } from './cloud.js'
import { extrairPlaca } from './anpr.js'
import { abrirAcesso, aplicarComando, extrairUserIdEvento } from './intelbras.js'
import { Store } from './store.js'
import { guardaDeBoot, verificarEAtualizar, VERSAO_EDGE } from './updater.js'
import { fazerBackup } from './backup.js'

const log = pino({ name: 'edge' })

async function main() {
  guardaDeBoot() // rollback automático se um update recém-aplicado não estabilizar
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
  const facialDevs = cfg.dispositivos.filter((d) => d.tipo === 'facial')
  const server = createServer((req, res) => {
    let corpo = ''
    req.on('data', (c) => (corpo += c))
    req.on('end', async () => {
      res.writeHead(200).end('OK')
      const origem = (req.socket.remoteAddress ?? '').replace('::ffff:', '')
      const url = req.url ?? '/'

      // keepalive do modo online do BioT
      if (url.startsWith('/keepalive')) return

      // evento de acesso do controlador facial (Event Server BioT)
      if (url.startsWith('/notification')) {
        const userId = extrairUserIdEvento(corpo)
        if (!userId) return
        const dev = porIp.get(origem) ?? facialDevs[0]
        if (!dev) return log.warn({ origem, userId }, 'evento facial sem dispositivo configurado')
        // QR de convite de visitante: o leitor devolve o conteúdo lido
        // (prefixo V-) no lugar do UserID numérico
        if (/^V-[A-Z0-9]{10,}$/i.test(userId)) {
          try {
            const r = await cloud.validarQr(dev.dispositivo_id, userId)
            log.info({ dev: dev.nome, qr: userId, resultado: r.resultado, visitante: r.visitante?.nome }, 'QR de visitante')
            if (r.resultado === 'liberado') await abrirAcesso(dev)
          } catch (err) {
            log.warn({ err: (err as Error).message }, 'QR sem Cloud — negado (fail-safe p/ visitantes)')
          }
          return
        }
        const pessoaId = store.pessoaDeUserId(userId)
        if (!pessoaId) return log.warn({ dev: dev.nome, userId }, 'UserID sem pessoa mapeada')
        try {
          const r = await cloud.validarFacial(dev.dispositivo_id, pessoaId)
          log.info({ dev: dev.nome, userId, resultado: r.resultado }, 'facial registrado na Cloud')
        } catch {
          store.enfileirarEvento({
            dispositivo_id: dev.dispositivo_id,
            pessoa_id: pessoaId,
            tipo: 'acesso_area',
            resultado: 'liberado', // o controlador decidiu localmente
            metodo: 'facial',
            ocorrido_em: new Date().toISOString(),
          })
          log.warn({ dev: dev.nome, userId }, 'facial enfileirado (Cloud offline)')
        }
        return
      }

      // push ANPR das câmeras LPR (path /anpr ou default)
      const placa = extrairPlaca(corpo)
      if (!placa) return
      const dev = porIp.get(origem) ?? lprDevs[0]
      if (!dev || dev.tipo !== 'lpr') return log.warn({ origem, placa }, 'push ANPR sem dispositivo LPR configurado')
      await decidirLpr(dev, placa)
    })
  })
  server.listen(cfg.lpr_listen_port, () =>
    log.info({ porta: cfg.lpr_listen_port, lpr: lprDevs.length, faciais: facialDevs.length }, 'listener HTTP no ar (ANPR + eventos BioT)')
  )

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
          const userId = cmd.payload?.pessoa_id ? store.userIdDe(cmd.payload.pessoa_id) : ''
          const ok = dev.tipo === 'facial' ? await aplicarComando(dev, cmd, userId) : true
          await cloud.ackComando(cmd.id, ok)
          log.info({ dev: dev.nome, tipo: cmd.tipo_comando, ok }, 'comando processado')
        }
        await cloud.heartbeat(dev.dispositivo_id, 'online', VERSAO_EDGE)
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

  // backup local diário (config + estado) e verificação de update a cada 6h
  fazerBackup()
  const timerBackup = setInterval(() => fazerBackup(), 24 * 3600_000)
  const checarUpdate = () =>
    verificarEAtualizar(cloud).catch((err) => log.warn({ err: err.message }, 'checagem de update falhou'))
  setTimeout(checarUpdate, 30_000)
  const timerUpdate = setInterval(checarUpdate, 6 * 3600_000)
  log.info({ versao: VERSAO_EDGE }, 'Edge no ar')

  const encerrar = () => {
    log.info('encerrando Edge')
    clearInterval(timer)
    clearInterval(timerBackup)
    clearInterval(timerUpdate)
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
