import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('registro de token de push', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let token: string
  const fcmToken = 'fcm-token-de-teste-com-tamanho-suficiente-123456'

  beforeAll(async () => {
    t = await createTestTenant(sql, 'push')
    app = await buildApp()
    await app.ready()
    token = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: t.morador.email, senha: t.morador.senha, tenant_id: t.tenantId },
      })
    ).json().data.token
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('registra e atualiza (upsert) o token do usuário logado', async () => {
    const registrar = () =>
      app.inject({
        method: 'POST',
        url: '/push/token',
        headers: { authorization: `Bearer ${token}` },
        payload: { token: fcmToken, plataforma: 'web' },
      })
    const res1 = await registrar()
    expect(res1.statusCode).toBe(201)
    const res2 = await registrar() // mesmo token de novo → upsert, não erro
    expect(res2.statusCode).toBe(201)

    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    const rows = await sql.unsafe(`SELECT pessoa_id FROM push_tokens WHERE token = $1`, [fcmToken])
    expect(rows.length).toBe(1)
    expect(rows[0].pessoa_id).toBe(t.morador.pessoaId)
  })

  it('remove o token (logout/desativar)', async () => {
    const res = await app.inject({
      method: 'DELETE',
      url: '/push/token',
      headers: { authorization: `Bearer ${token}` },
      payload: { token: fcmToken },
    })
    expect(res.statusCode).toBe(200)
    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    const rows = await sql.unsafe(`SELECT 1 FROM push_tokens WHERE token = $1`, [fcmToken])
    expect(rows.length).toBe(0)
  })

  it('exige autenticação', async () => {
    const res = await app.inject({ method: 'POST', url: '/push/token', payload: { token: fcmToken } })
    expect(res.statusCode).toBe(401)
  })
})
