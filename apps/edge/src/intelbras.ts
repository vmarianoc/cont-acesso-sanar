import { createHash, randomBytes } from 'node:crypto'
import pino from 'pino'
import type { DispositivoEdge } from './config.js'

const log = pino({ name: 'edge-intelbras' })

/**
 * Cliente da HTTP API (v3) dos equipamentos Intelbras (câmeras LPR e
 * controladores de acesso). A API usa Digest auth; implementamos o handshake
 * com node:crypto para não depender de SDK.
 */

const md5 = (v: string) => createHash('md5').update(v).digest('hex')

async function digestFetch(dev: DispositivoEdge, caminho: string, init?: RequestInit): Promise<Response> {
  const url = `http://${dev.ip}${caminho}`
  const primeira = await fetch(url, { ...init, signal: AbortSignal.timeout(4000) })
  if (primeira.status !== 401) return primeira

  const desafio = primeira.headers.get('www-authenticate') ?? ''
  const campo = (nome: string) => desafio.match(new RegExp(`${nome}="?([^",]+)"?`))?.[1]
  const realm = campo('realm') ?? ''
  const nonce = campo('nonce') ?? ''
  const qop = campo('qop')
  const metodo = init?.method ?? 'GET'
  const uri = caminho
  const cnonce = randomBytes(8).toString('hex')
  const nc = '00000001'
  const ha1 = md5(`${dev.usuario}:${realm}:${dev.senha}`)
  const ha2 = md5(`${metodo}:${uri}`)
  const response = qop
    ? md5(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : md5(`${ha1}:${nonce}:${ha2}`)
  const auth =
    `Digest username="${dev.usuario}", realm="${realm}", nonce="${nonce}", uri="${uri}", ` +
    `response="${response}"` +
    (qop ? `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"` : '')
  return fetch(url, {
    ...init,
    headers: { ...(init?.headers as Record<string, string>), authorization: auth },
    signal: AbortSignal.timeout(4000),
  })
}

/** Abre o relé (cancela/porta) do equipamento. */
export async function abrirAcesso(dev: DispositivoEdge): Promise<boolean> {
  try {
    // Controladores de acesso e câmeras LPR expõem o openDoor do canal 1.
    const res = await digestFetch(dev, '/cgi-bin/accessControl.cgi?action=openDoor&channel=1')
    if (res.ok) return true
    // fallback: acionamento de saída de alarme/relé (câmeras)
    const alt = await digestFetch(
      dev,
      '/cgi-bin/trafficSnap.cgi?action=openStrobe&channel=1&info.openType=Normal&info.plateNumber='
    )
    return alt.ok
  } catch (err) {
    log.warn({ dev: dev.nome, err: (err as Error).message }, 'falha ao acionar relé')
    return false
  }
}

/**
 * Aplica um comando da sync_queue no equipamento facial (cadastro vivo):
 * inserir/atualizar/remover usuário e foto facial.
 */
export async function aplicarComando(
  dev: DispositivoEdge,
  comando: { tipo_comando: string; payload: Record<string, any> }
): Promise<boolean> {
  const p = comando.payload ?? {}
  try {
    switch (comando.tipo_comando) {
      case 'pessoa.criar':
      case 'pessoa.atualizar': {
        const res = await digestFetch(
          dev,
          `/cgi-bin/recordUpdater.cgi?action=insert&name=AccessControlCard&CardName=${encodeURIComponent(
            p.nome ?? ''
          )}&CardNo=${encodeURIComponent(p.pessoa_id ?? '')}&CardStatus=0&CardType=0`
        )
        return res.ok
      }
      case 'pessoa.remover': {
        const res = await digestFetch(
          dev,
          `/cgi-bin/recordUpdater.cgi?action=remove&name=AccessControlCard&CardNo=${encodeURIComponent(
            p.pessoa_id ?? ''
          )}`
        )
        return res.ok
      }
      case 'face.atualizar': {
        if (!p.foto_base64) return true
        const res = await digestFetch(
          dev,
          `/cgi-bin/FaceInfoManager.cgi?action=add&UserID=${encodeURIComponent(p.pessoa_id ?? '')}`,
          {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ Info: { PhotoData: [p.foto_base64] } }),
          }
        )
        return res.ok
      }
      default:
        log.warn({ tipo: comando.tipo_comando }, 'comando desconhecido — marcando como executado')
        return true
    }
  } catch (err) {
    log.warn({ dev: dev.nome, tipo: comando.tipo_comando, err: (err as Error).message }, 'falha ao aplicar comando')
    return false
  }
}

/**
 * Assina o stream de eventos do controlador facial
 * (eventManager attach, multipart infinito) e chama onEvento com o UserID
 * reconhecido a cada passagem. Reconecta sozinho.
 */
export function assinarEventosFacial(
  dev: DispositivoEdge,
  onEvento: (userId: string) => void
): () => void {
  let ativo = true
  const conectar = async () => {
    while (ativo) {
      try {
        const res = await fetch(
          `http://${dev.ip}/cgi-bin/eventManager.cgi?action=attach&codes=[AccessControl]`,
          {} // stream infinito: sem timeout
        )
        // Digest também se aplica aqui; simplificação: alguns firmwares aceitam
        // basic/anonymous no attach. Em produção, ajuste conforme o equipamento.
        if (!res.ok || !res.body) throw new Error(`attach HTTP ${res.status}`)
        const reader = (res.body as any).getReader()
        let buffer = ''
        while (ativo) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += Buffer.from(value).toString('utf8')
          const m = buffer.match(/UserID=([\w-]+)/)
          if (m) {
            onEvento(m[1])
            buffer = ''
          }
          if (buffer.length > 65536) buffer = buffer.slice(-1024)
        }
      } catch (err) {
        log.warn({ dev: dev.nome, err: (err as Error).message }, 'stream de eventos caiu; reconectando em 5s')
        await new Promise((r) => setTimeout(r, 5000))
      }
    }
  }
  conectar()
  return () => {
    ativo = false
  }
}
