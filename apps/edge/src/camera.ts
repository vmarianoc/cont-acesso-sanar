import pino from 'pino'
import { digestFetch } from './intelbras.js'
import type { DispositivoEdge } from './config.js'

const log = pino({ name: 'edge-camera' })

/**
 * Puxa um snapshot JPEG da câmera no instante do acesso — não é streaming/
 * RTSP, só a foto para anexar ao evento (facial/LPR). Auth Digest reaproveita
 * o mesmo digestFetch dos equipamentos BioT (ip/usuario/senha genéricos);
 * o caminho HTTP é configurável por câmera via `snapshot_path`.
 */
export async function capturarSnapshot(dev: DispositivoEdge): Promise<string | null> {
  try {
    const res = await digestFetch(dev, dev.snapshot_path ?? '/cgi-bin/snapshot.cgi?channel=1')
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    if (buffer.length < 100) return null
    return buffer.toString('base64')
  } catch (err) {
    log.warn({ dev: dev.nome, err: (err as Error).message }, 'falha ao capturar snapshot da câmera')
    return null
  }
}
