import { describe, it, expect } from 'vitest'
import { unlinkSync, existsSync } from 'node:fs'
import { extrairUserIdEvento, payloadUsuario, payloadFace } from '../src/intelbras.js'
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

  it('retorna null sem identificação', () => {
    expect(extrairUserIdEvento('{"heartbeat":true}')).toBeNull()
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
})
