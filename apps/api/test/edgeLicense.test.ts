import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('POST /edge/validate-license', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let licenseKey: string

  const validar = (body: object) =>
    app.inject({ method: 'POST', url: '/edge/validate-license', payload: body })

  beforeAll(async () => {
    t = await createTestTenant(sql, 'edge')
    app = await buildApp()
    await app.ready()
    const rows = await sql`SELECT license_key FROM public.licencas WHERE tenant_id = ${t.tenantId}`
    licenseKey = rows[0].license_key
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('createTenant gera uma license_key', () => {
    expect(licenseKey).toMatch(/^AP-[0-9A-F]{32}$/)
  })

  it('valida uma chave existente e retorna plano/limites', async () => {
    const res = await validar({ license_key: licenseKey })
    expect(res.statusCode).toBe(200)
    const d = res.json().data
    expect(d.valida).toBe(true)
    expect(d.degradado).toBe(false)
    expect(d.plano).toBe('pro')
    expect(d.limites.unidades).toBe(500)
    expect(d.tenant_id).toBe(t.tenantId)
  })

  it('recusa chave desconhecida', async () => {
    const res = await validar({ license_key: 'AP-DEADBEEFDEADBEEFDEADBEEFDEADBEEF' })
    expect(res.statusCode).toBe(404)
    expect(res.json().erro.codigo).toBe('LICENCA_NAO_ENCONTRADA')
  })

  it('vincula o fingerprint na 1ª validação e recusa hardware diferente', async () => {
    const bind = await validar({ license_key: licenseKey, fingerprint: 'sha256:hw-1' })
    expect(bind.statusCode).toBe(200)

    const outro = await validar({ license_key: licenseKey, fingerprint: 'sha256:hw-2' })
    expect(outro.statusCode).toBe(409)
    expect(outro.json().erro.codigo).toBe('FINGERPRINT_INVALIDO')

    const mesmo = await validar({ license_key: licenseKey, fingerprint: 'sha256:hw-1' })
    expect(mesmo.statusCode).toBe(200)
    expect(mesmo.json().data.valida).toBe(true)
  })

  it('licença suspensa retorna modo degradado (não bloqueia acesso físico)', async () => {
    await sql`UPDATE public.licencas SET ativa = false WHERE tenant_id = ${t.tenantId}`
    const res = await validar({ license_key: licenseKey, fingerprint: 'sha256:hw-1' })
    expect(res.statusCode).toBe(200)
    const d = res.json().data
    expect(d.valida).toBe(false)
    expect(d.degradado).toBe(true)
    expect(d.ativa).toBe(false)
  })
})
