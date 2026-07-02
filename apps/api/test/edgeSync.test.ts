import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'
import { getNotificacoesQueue } from '../src/workers/notificacoesQueue.js'

describe('POST /edge/sync/eventos — notificação de acesso com foto', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let token: string

  beforeAll(async () => {
    t = await createTestTenant(sql, 'edgesync')
    app = await buildApp()
    await app.ready()
    token = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: t.porteiro.email, senha: t.porteiro.senha, tenant_id: t.tenantId },
      })
    ).json().data.token
  })

  afterAll(async () => {
    await getNotificacoesQueue().close()
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  const sync = (eventos: Record<string, unknown>[]) =>
    app.inject({
      method: 'POST',
      url: '/edge/sync/eventos',
      headers: { authorization: `Bearer ${token}` },
      payload: { tenant_id: t.tenantId, schema_name: t.schemaName, eventos },
    })

  it('cria notificação com a foto para acesso liberado de pessoa identificada', async () => {
    const res = await sync([
      {
        dispositivo_id: t.dispositivoId,
        pessoa_id: t.morador.pessoaId,
        tipo: 'entrada',
        resultado: 'liberado',
        metodo: 'facial',
        foto_url: 'https://example.com/acesso.jpg',
        ocorrido_em: new Date().toISOString(),
      },
    ])
    expect(res.statusCode).toBe(200)
    expect(res.json().data.sincronizados).toBe(1)

    const reserved = await sql.reserve()
    try {
      await reserved.unsafe(`SET search_path TO ${t.schemaName}, public`)
      const notifs = await reserved.unsafe<{ tipo: string; titulo: string; dados: any }[]>(
        `SELECT tipo, titulo, dados FROM notificacoes WHERE pessoa_id = $1 AND tipo = 'acesso'`,
        [t.morador.pessoaId]
      )
      expect(notifs.length).toBe(1)
      expect(notifs[0].titulo).toBe('Acesso liberado')
      expect(notifs[0].dados.foto_url).toBe('https://example.com/acesso.jpg')
    } finally {
      await reserved.unsafe('SET search_path TO public')
      reserved.release()
    }
  })

  it('não notifica eventos sem pessoa identificada ou com resultado de erro', async () => {
    const res = await sync([
      {
        dispositivo_id: t.dispositivoId,
        tipo: 'entrada',
        resultado: 'liberado',
        metodo: 'qrcode',
        ocorrido_em: new Date().toISOString(),
      },
      {
        dispositivo_id: t.dispositivoId,
        pessoa_id: t.morador.pessoaId,
        tipo: 'entrada',
        resultado: 'erro',
        metodo: 'facial',
        ocorrido_em: new Date().toISOString(),
      },
    ])
    expect(res.statusCode).toBe(200)
    expect(res.json().data.sincronizados).toBe(2)

    const reserved = await sql.reserve()
    try {
      await reserved.unsafe(`SET search_path TO ${t.schemaName}, public`)
      const notifs = await reserved.unsafe(
        `SELECT id FROM notificacoes WHERE pessoa_id = $1 AND tipo = 'acesso'`,
        [t.morador.pessoaId]
      )
      // apenas a notificação do teste anterior (acesso liberado com pessoa) deve existir
      expect(notifs.length).toBe(1)
    } finally {
      await reserved.unsafe('SET search_path TO public')
      reserved.release()
    }
  })
})
