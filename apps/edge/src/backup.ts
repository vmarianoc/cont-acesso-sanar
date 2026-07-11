import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import pino from 'pino'

const log = pino({ name: 'edge-backup' })
const DIR = 'backups'
const MANTER = 30

/**
 * Backup local reversível do Edge: config (dispositivos/credenciais) e
 * estado (mapa pessoa↔UserID do BioT, cache de placas, fila offline).
 * Roda diariamente e antes de todo update; restauração via
 * `npm run restaurar -- <pasta>`.
 */
export function fazerBackup(
  arquivos: string[] = ['edge.config.json', 'edge.state.json'],
  base = '.'
): string | null {
  try {
    const carimbo = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const dir = join(base, DIR)
    const destino = join(dir, carimbo)
    mkdirSync(destino, { recursive: true })
    for (const arq of arquivos) {
      if (existsSync(join(base, arq))) cpSync(join(base, arq), join(destino, arq))
    }
    // rotação
    const todos = readdirSync(dir).sort()
    for (const antigo of todos.slice(0, Math.max(0, todos.length - MANTER))) {
      rmSync(join(dir, antigo), { recursive: true, force: true })
    }
    log.info({ destino }, 'backup local feito')
    return destino
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'falha no backup local')
    return null
  }
}

export function restaurarBackup(pasta: string, base = '.'): void {
  const origem = join(base, DIR, pasta)
  if (!existsSync(origem)) throw new Error(`backup não encontrado: ${origem}`)
  for (const arq of readdirSync(origem)) {
    cpSync(join(origem, arq), join(base, arq), { force: true })
  }
  log.info({ origem }, 'backup restaurado — reinicie o serviço')
}
