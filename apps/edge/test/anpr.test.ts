import { describe, it, expect } from 'vitest'
import { extrairPlaca, normalizarPlaca } from '../src/anpr.js'

describe('extração de placa dos pushes ANPR Intelbras', () => {
  it('JSON com PlateNumber aninhado (evento inteligente)', () => {
    const corpo = JSON.stringify({
      Picture: { Plate: { PlateNumber: 'ABC1D23', Confidence: 95 } },
    })
    expect(extrairPlaca(corpo)).toBe('ABC1D23')
  })

  it('JSON plano com placa antiga e hífen', () => {
    expect(extrairPlaca('{"plate":"abc-1234"}')).toBe('ABC1234')
  })

  it('XML de notificação HTTP', () => {
    expect(extrairPlaca('<event><plateNumber>RIO2A18</plateNumber></event>')).toBe('RIO2A18')
  })

  it('texto solto (key=value)', () => {
    expect(extrairPlaca('Events[0].PlateNumber=XYZ9876&channel=1')).toBe('XYZ9876')
  })

  it('ignora corpo sem placa válida', () => {
    expect(extrairPlaca('{"foo":"bar"}')).toBeNull()
    expect(extrairPlaca('heartbeat ok')).toBeNull()
  })

  it('normaliza formatos', () => {
    expect(normalizarPlaca(' abc-1d23 ')).toBe('ABC1D23')
  })
})
