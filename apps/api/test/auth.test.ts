import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { hashPassword, verifyPassword } from '../src/services/authService.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('authService', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('segredo123')
    expect(hash).not.toBe('segredo123')
    expect(await verifyPassword('segredo123', hash)).toBe(true)
    expect(await verifyPassword('errado', hash)).toBe(false)
  })
})

describe('POST /auth/login', () => {
  let app: FastifyInstance
  let sql = makeSql()
  let t: TestTenant

  beforeAll(async () => {
    t = await createTestTenant(sql, 'auth')
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('logs in with valid credentials', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: t.porteiro.email, senha: t.porteiro.senha, tenant_id: t.tenantId },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.data.token).toBeTruthy()
    expect(body.data.perfil).toBe('porteiro')
  })

  it('rejects wrong password', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: t.porteiro.email, senha: 'errada', tenant_id: t.tenantId },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().erro.codigo).toBe('CREDENCIAIS_INVALIDAS')
  })
})
