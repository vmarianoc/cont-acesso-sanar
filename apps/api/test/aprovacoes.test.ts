import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'
import { getNotificacoesQueue } from '../src/workers/notificacoesQueue.js'

describe('PATCH /aprovacoes/:id — Cadastro Vivo cascade', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let token: string

  beforeAll(async () => {
    t = await createTestTenant(sql, 'aprov')
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
    await getNotificacoesQueue().close()
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('enqueues an Edge command, a notification and an audit record on approval', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/aprovacoes/${t.aprovacaoId}`,
      headers: { authorization: `Bearer ${token}` },
      payload: { status: 'aprovado', observacao: 'ok' },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.status).toBe('aprovado')

    const reserved = await sql.reserve()
    try {
      await reserved.unsafe(`SET search_path TO ${t.schemaName}, public`)

      const cmds = await reserved.unsafe<{ tipo_comando: string; typ: string }[]>(
        `SELECT tipo_comando, jsonb_typeof(payload) AS typ FROM sync_queue WHERE payload->>'aprovacao_id' = $1`,
        [t.aprovacaoId]
      )
      expect(cmds.length).toBeGreaterThan(0)
      expect(cmds[0].tipo_comando).toBe('cadastro.veiculo')
      expect(cmds[0].typ).toBe('object')

      const notifs = await reserved.unsafe(
        `SELECT id FROM notificacoes WHERE dados->>'aprovacao_id' = $1`,
        [t.aprovacaoId]
      )
      expect(notifs.length).toBe(1)

      const audit = await reserved.unsafe(
        `SELECT acao FROM auditoria WHERE registro_id = $1 AND tabela = 'aprovacoes'`,
        [t.aprovacaoId]
      )
      expect(audit.length).toBeGreaterThan(0)

      const hist = await reserved.unsafe(
        `SELECT status FROM historico_aprovacoes WHERE aprovacao_id = $1`,
        [t.aprovacaoId]
      )
      expect(hist.length).toBe(1)
    } finally {
      await reserved.unsafe('SET search_path TO public')
      reserved.release()
    }
  })
})
