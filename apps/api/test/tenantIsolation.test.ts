import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

async function login(app: FastifyInstance, t: TestTenant): Promise<string> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: t.porteiro.email, senha: t.porteiro.senha, tenant_id: t.tenantId },
  })
  return res.json().data.token
}

describe('multi-tenant isolation under concurrency', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let a: TestTenant
  let b: TestTenant

  beforeAll(async () => {
    a = await createTestTenant(sql, 'A')
    b = await createTestTenant(sql, 'B')
    app = await buildApp()
    await app.ready()
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, a)
    await dropTestTenant(sql, b)
    await sql.end()
  })

  it('never leaks data across tenants when requests interleave', async () => {
    const tokenA = await login(app, a)
    const tokenB = await login(app, b)

    const calls = Array.from({ length: 40 }).map((_, i) => {
      const isA = i % 2 === 0
      const token = isA ? tokenA : tokenB
      const expectedNome = isA ? a.moradorNome : b.moradorNome
      const forbiddenNome = isA ? b.moradorNome : a.moradorNome
      return app
        .inject({ method: 'GET', url: '/pessoas?limit=100', headers: { authorization: `Bearer ${token}` } })
        .then((res) => {
          expect(res.statusCode).toBe(200)
          const nomes = res.json().data.map((p: any) => p.nome)
          expect(nomes).toContain(expectedNome)
          expect(nomes).not.toContain(forbiddenNome)
        })
    })

    await Promise.all(calls)
  })
})
