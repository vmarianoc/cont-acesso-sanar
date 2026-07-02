import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'
import { enviarPush } from '../src/services/pushService.js'

describe('pushService.enviarPush', () => {
  it('roda em modo stub quando FCM_SERVICE_ACCOUNT_JSON não está configurado', async () => {
    expect(process.env.FCM_SERVICE_ACCOUNT_JSON).toBeUndefined()
    const resultado = await enviarPush({ tokens: ['token-qualquer'], titulo: 'Oi', corpo: 'Teste' })
    expect(resultado).toEqual({ modo: 'stub', enviados: 0, falhas: 0, tokensInvalidos: [] })
  })

  it('roda em modo stub quando não há tokens, mesmo sem checar credenciais', async () => {
    const resultado = await enviarPush({ tokens: [], titulo: 'Oi', corpo: 'Teste' })
    expect(resultado.modo).toBe('stub')
    expect(resultado.enviados).toBe(0)
  })
})

describe('POST/DELETE /push/tokens', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let token: string
  const auth = () => ({ authorization: `Bearer ${token}` })

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

  it('registra o token vinculado à pessoa do usuário autenticado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/push/tokens',
      headers: auth(),
      payload: { token: 'device-token-abc123', plataforma: 'android' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().data).toMatchObject({
      pessoa_id: t.morador.pessoaId,
      plataforma: 'android',
      ativo: true,
    })
  })

  it('reenviar o mesmo token atualiza em vez de duplicar (upsert)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/push/tokens',
      headers: auth(),
      payload: { token: 'device-token-abc123', plataforma: 'ios' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().data.plataforma).toBe('ios')

    const reserved = await sql.reserve()
    try {
      await reserved.unsafe(`SET search_path TO ${t.schemaName}, public`)
      const rows = await reserved.unsafe(
        `SELECT id FROM dispositivos_push WHERE token = 'device-token-abc123'`
      )
      expect(rows.length).toBe(1)
    } finally {
      await reserved.unsafe('SET search_path TO public')
      reserved.release()
    }
  })

  it('remove (soft-delete) o token', async () => {
    const del = await app.inject({
      method: 'DELETE',
      url: '/push/tokens/device-token-abc123',
      headers: auth(),
    })
    expect(del.statusCode).toBe(200)

    const naoEncontrado = await app.inject({
      method: 'DELETE',
      url: '/push/tokens/token-nunca-existiu',
      headers: auth(),
    })
    expect(naoEncontrado.statusCode).toBe(404)

    const reserved = await sql.reserve()
    try {
      await reserved.unsafe(`SET search_path TO ${t.schemaName}, public`)
      const rows = await reserved.unsafe<{ ativo: boolean }[]>(
        `SELECT ativo FROM dispositivos_push WHERE token = 'device-token-abc123'`
      )
      expect(rows[0].ativo).toBe(false)
    } finally {
      await reserved.unsafe('SET search_path TO public')
      reserved.release()
    }
  })
})
