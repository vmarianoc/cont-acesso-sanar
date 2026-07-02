import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import {
  assegurarCapacidade,
  LicencaError,
  normalizarPlano,
  type LicencaEfetiva,
} from '../src/services/licencaService.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

const base: LicencaEfetiva = {
  plano: 'pro',
  maxUnidades: 500,
  maxDispositivos: 32,
  ativa: true,
  validade: null,
  expirada: false,
}

describe('licencaService.assegurarCapacidade', () => {
  it('permite quando dentro do limite e para plano ilimitado', () => {
    expect(() => assegurarCapacidade(base, 499, 1)).not.toThrow()
    expect(() => assegurarCapacidade({ ...base, maxUnidades: null }, 10_000, 5_000)).not.toThrow()
  })
  it('bloqueia acima do limite, inativa ou expirada', () => {
    expect(() => assegurarCapacidade(base, 500, 1)).toThrow(LicencaError)
    expect(() => assegurarCapacidade({ ...base, ativa: false }, 0, 1)).toThrow(/suspensa/i)
    expect(() => assegurarCapacidade({ ...base, expirada: true }, 0, 1)).toThrow(/expirada/i)
  })
  it('normaliza nomes de plano', () => {
    expect(normalizarPlano('profissional')).toBe('pro')
    expect(normalizarPlano('START')).toBe('start')
    expect(normalizarPlano('Enterprise')).toBe('enterprise')
  })
})

describe('GET /licenca e enforcement em POST /unidades', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let token: string
  const auth = () => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    t = await createTestTenant(sql, 'licenca')
    app = await buildApp()
    await app.ready()
    token = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: t.sindico.email, senha: t.sindico.senha, tenant_id: t.tenantId },
      })
    ).json().data.token
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('createTenant registra uma licença para o tenant', async () => {
    const rows = await sql`SELECT plano, max_unidades FROM public.licencas WHERE tenant_id = ${t.tenantId}`
    expect(rows.length).toBe(1)
    expect(rows[0].plano).toBe('pro')
    expect(Number(rows[0].max_unidades)).toBe(500)
  })

  it('GET /licenca retorna plano, limites e uso', async () => {
    const res = await app.inject({ method: 'GET', url: '/licenca', headers: auth() })
    expect(res.statusCode).toBe(200)
    const d = res.json().data
    expect(d.plano).toBe('pro')
    expect(d.limites.unidades).toBe(500)
    expect(d.uso.unidades).toBeGreaterThanOrEqual(1) // helper cria 1 unidade
  })

  it('bloqueia criação de unidade acima do limite do plano', async () => {
    await sql`UPDATE public.licencas SET max_unidades = 1 WHERE tenant_id = ${t.tenantId}`
    const res = await app.inject({
      method: 'POST',
      url: '/unidades',
      headers: auth(),
      payload: { bloco_id: t.blocoId, numero: '999-lic' },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().erro.codigo).toBe('LIMITE_UNIDADES')
  })
})
