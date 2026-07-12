import { describe, it, expect } from 'vitest'
import { unlinkSync, existsSync } from 'node:fs'
import { extrairUserIdEvento, extrairFotoEvento, payloadUsuario, payloadFace } from '../src/intelbras.js'
import { Store } from '../src/store.js'

describe('eventos do Event Server BioT', () => {
  it('extrai UserID de evento JSON', () => {
    const corpo = JSON.stringify({ Events: [{ Code: 'AccessControl', Data: { UserID: '16', Method: 15 } }] })
    expect(extrairUserIdEvento(corpo)).toBe('16')
  })

  it('extrai UserID de corpo texto/multipart', () => {
    expect(extrairUserIdEvento('Events[0].UserID=42\r\nEvents[0].Door=0')).toBe('42')
  })

  it('cai para CardNo quando não há UserID', () => {
    expect(extrairUserIdEvento('{"CardNo":"1B11"}')).toBe('1B11')
  })

  it('QR de convite chega como CardNo e mantém o formato V-…', () => {
    expect(extrairUserIdEvento('{"CardNo":"V-ABC123DEF456GHI78"}')).toBe('V-ABC123DEF456GHI78')
  })

  it('retorna null sem identificação', () => {
    expect(extrairUserIdEvento('{"heartbeat":true}')).toBeNull()
  })
})

describe('foto embutida no evento (facial/ANPR)', () => {
  const fotoFake = 'A'.repeat(150) // base64 fake, só precisa passar do tamanho mínimo
  it('extrai foto de campo conhecido em JSON aninhado', () => {
    const corpo = JSON.stringify({ Events: [{ Data: { UserID: '16', PicData: fotoFake } }] })
    expect(extrairFotoEvento(corpo)).toBe(fotoFake)
  })

  it('retorna null sem campo de foto', () => {
    expect(extrairFotoEvento(JSON.stringify({ UserID: '16' }))).toBeNull()
  })

  it('retorna null para corpo não-JSON', () => {
    expect(extrairFotoEvento('UserID=16')).toBeNull()
  })
})

describe('payloads V2 do BioT', () => {
  it('UserList no formato da collection', () => {
    const p = payloadUsuario('7', 'Ana Souza') as any
    expect(p.UserList[0]).toMatchObject({ UserID: '7', UserName: 'Ana Souza', Doors: [0], TimeSections: [255] })
    expect(p.UserList[0].ValidTo).toBe('2037-12-31 23:59:59')
  })

  it('FaceList com PhotoData base64', () => {
    const p = payloadFace('7', 'Zm90bw==') as any
    expect(p.FaceList[0]).toEqual({ UserID: '7', PhotoData: ['Zm90bw=='] })
  })

  it('UserList com janela de validade do convite facial de visitante', () => {
    const p = payloadUsuario('9', 'Visitante Teste', '2026-07-12T10:00:00.000Z', '2026-07-12T14:00:00.000Z') as any
    expect(p.UserList[0].ValidFrom).toBe('2026-07-12 10:00:00')
    expect(p.UserList[0].ValidTo).toBe('2026-07-12 14:00:00')
  })
})

describe('mapa pessoa_id ↔ UserID do Store', () => {
  const arq = 'test-state.json'
  it('gera IDs incrementais estáveis e resolve de volta', () => {
    if (existsSync(arq)) unlinkSync(arq)
    const store = new Store(arq)
    const a = store.userIdDe('uuid-a')
    const b = store.userIdDe('uuid-b')
    expect(a).toBe('1')
    expect(b).toBe('2')
    expect(store.userIdDe('uuid-a')).toBe('1') // estável
    expect(store.pessoaDeUserId('2')).toBe('uuid-b')
    expect(store.pessoaDeUserId('99')).toBeNull()
    // persistência
    const store2 = new Store(arq)
    expect(store2.userIdDe('uuid-a')).toBe('1')
    expect(store2.userIdDe('uuid-c')).toBe('3')
    unlinkSync(arq)
  })

  it('agenda e remove faces de visitante vencidas', () => {
    if (existsSync(arq)) unlinkSync(arq)
    const store = new Store(arq)
    store.agendarRemocao('dev-1', '10', new Date(Date.now() - 1000).toISOString()) // já venceu
    store.agendarRemocao('dev-1', '11', new Date(Date.now() + 3600_000).toISOString()) // ainda vale
    const vencidas = store.removerVencidas()
    expect(vencidas).toHaveLength(1)
    expect(vencidas[0].user_id).toBe('10')
    expect(store.removerVencidas()).toHaveLength(0) // já retirada da fila
    unlinkSync(arq)
  })
})
