import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'
import { getNotificacoesQueue } from '../src/workers/notificacoesQueue.js'

describe('POST /morador/visitantes/pre-autorizar', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let token: string
  const auth = () => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    t = await createTestTenant(sql, 'morador-visitante')
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
    await getNotificacoesQueue().close()
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('salva a foto do visitante e notifica o próprio morador com ela', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/morador/visitantes/pre-autorizar',
      headers: auth(),
      payload: {
        nome: 'Visitante Teste',
        unidade_id: t.unidadeId,
        foto_url: 'https://example.com/visitante.jpg',
        valido_de: new Date().toISOString(),
        valido_ate: new Date(Date.now() + 86_400_000).toISOString(),
      },
    })
    expect(res.statusCode).toBe(201)
    const visitante = res.json().data
    expect(visitante.foto_url).toBe('https://example.com/visitante.jpg')
    expect(visitante.pre_autorizado_por).toBe(t.morador.pessoaId)

    const reserved = await sql.reserve()
    try {
      await reserved.unsafe(`SET search_path TO ${t.schemaName}, public`)
      const notifs = await reserved.unsafe<{ tipo: string; dados: any }[]>(
        `SELECT tipo, dados FROM notificacoes WHERE dados->>'visitante_id' = $1`,
        [visitante.id]
      )
      expect(notifs.length).toBe(1)
      expect(notifs[0].tipo).toBe('visita')
      expect(notifs[0].dados.foto_url).toBe('https://example.com/visitante.jpg')
    } finally {
      await reserved.unsafe('SET search_path TO public')
      reserved.release()
    }
  })
})
