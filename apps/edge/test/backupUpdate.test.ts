import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fazerBackup, restaurarBackup } from '../src/backup.js'

const BASE = 'test-sandbox'

describe('backup local reversível do Edge', () => {
  beforeEach(() => {
    rmSync(BASE, { recursive: true, force: true })
    mkdirSync(BASE, { recursive: true })
    writeFileSync(join(BASE, 'edge.config.json'), '{"cloud_url":"x"}')
    writeFileSync(join(BASE, 'edge.state.json'), '{"placas":{"AAA1B22":"p1"},"user_ids":{"p1":"1"}}')
  })
  afterEach(() => rmSync(BASE, { recursive: true, force: true }))

  it('faz backup, sobrevive a perda do estado e restaura', () => {
    const destino = fazerBackup(undefined, BASE)
    expect(destino).toBeTruthy()
    expect(existsSync(join(destino!, 'edge.state.json'))).toBe(true)

    // simula perda/corrupção do estado
    writeFileSync(join(BASE, 'edge.state.json'), 'CORROMPIDO')
    const pasta = readdirSync(join(BASE, 'backups'))[0]
    restaurarBackup(pasta, BASE)
    const estado = JSON.parse(readFileSync(join(BASE, 'edge.state.json'), 'utf8'))
    expect(estado.user_ids.p1).toBe('1') // mapa do BioT recuperado
  })
})
