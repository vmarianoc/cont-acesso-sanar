import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import pino from 'pino'
import type { CloudClient } from './cloud.js'

const log = pino({ name: 'edge-updater' })

export const VERSAO_EDGE: string = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8')
).version

const ARQ_UPDATE = 'update.json' // marcador: update aplicado aguardando confirmação
const DIR_ROLLBACK = 'rollback'
const BOOTS_MAX = 3

interface MarcadorUpdate {
  versao: string
  versao_anterior: string
  boots: number
  aplicado_em: string
}

const lerMarcador = (): MarcadorUpdate | null => {
  try {
    return JSON.parse(readFileSync(ARQ_UPDATE, 'utf8'))
  } catch {
    return null
  }
}

/**
 * Guarda de boot: roda ANTES de tudo. Se um update recém-aplicado não
 * conseguiu estabilizar (3 boots seguidos falhando), restaura a versão
 * anterior automaticamente e reinicia — o condomínio nunca fica preso numa
 * versão quebrada.
 */
export function guardaDeBoot(): void {
  const m = lerMarcador()
  if (!m) return
  m.boots += 1
  writeFileSync(ARQ_UPDATE, JSON.stringify(m))
  if (m.boots > BOOTS_MAX) {
    const origem = join(DIR_ROLLBACK, m.versao_anterior)
    if (existsSync(origem)) {
      log.error({ versao: m.versao, restaurando: m.versao_anterior }, 'update instável — ROLLBACK automático')
      cpSync(join(origem, 'src'), 'src', { recursive: true, force: true })
      cpSync(join(origem, 'package.json'), 'package.json', { force: true })
      rmSync(ARQ_UPDATE, { force: true })
      process.exit(1) // NSSM/systemd reinicia já na versão anterior
    }
    rmSync(ARQ_UPDATE, { force: true })
    return
  }
  // estabilizou por 2 minutos → confirma o update
  setTimeout(() => {
    rmSync(ARQ_UPDATE, { force: true })
    log.info({ versao: m.versao }, 'update confirmado (boot estável)')
  }, 120_000).unref()
}

/** Mantém só os 5 rollbacks mais recentes. */
function podarRollbacks() {
  if (!existsSync(DIR_ROLLBACK)) return
  const dirs = readdirSync(DIR_ROLLBACK).sort()
  for (const d of dirs.slice(0, Math.max(0, dirs.length - 5))) {
    rmSync(join(DIR_ROLLBACK, d), { recursive: true, force: true })
  }
}

/**
 * Verifica na Cloud se há versão mais nova; se houver: faz backup da versão
 * corrente (reversível), baixa o pacote, confere o sha256, aplica e sai —
 * o service manager reinicia o Edge já atualizado.
 */
export async function verificarEAtualizar(cloud: CloudClient): Promise<void> {
  const check = await cloud.checarUpdate(VERSAO_EDGE)
  if (!check?.atualizar || !check.versao || !check.sha256) return
  const versao = check.versao
  const sha256 = check.sha256
  log.info({ de: VERSAO_EDGE, para: versao }, 'nova versão do Edge disponível — atualizando')

  const pacote = await cloud.baixarUpdate(versao)
  const hash = createHash('sha256').update(pacote).digest('hex')
  if (hash !== sha256) {
    log.error({ esperado: sha256, obtido: hash }, 'sha256 do pacote não confere — update abortado')
    return
  }

  // backup reversível da versão corrente
  const destino = join(DIR_ROLLBACK, VERSAO_EDGE)
  mkdirSync(destino, { recursive: true })
  cpSync('src', join(destino, 'src'), { recursive: true, force: true })
  cpSync('package.json', join(destino, 'package.json'), { force: true })
  podarRollbacks()

  // aplica: extrai o tgz por cima (Windows 10+ e Linux têm tar nativo)
  writeFileSync('update.tgz', pacote)
  execFileSync('tar', ['-xzf', 'update.tgz', '-C', '.'])
  rmSync('update.tgz', { force: true })
  try {
    execFileSync('npm', ['install', '--omit=dev', '--no-audit', '--no-fund'], {
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })
  } catch (err) {
    log.warn({ err: (err as Error).message }, 'npm install falhou — seguindo com dependências atuais')
  }

  writeFileSync(
    ARQ_UPDATE,
    JSON.stringify({ versao, versao_anterior: VERSAO_EDGE, boots: 0, aplicado_em: new Date().toISOString() })
  )
  log.info({ versao }, 'update aplicado — reiniciando')
  process.exit(0) // NSSM/systemd sobe a nova versão
}
