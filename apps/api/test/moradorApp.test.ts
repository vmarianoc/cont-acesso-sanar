import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('app do morador (resumo, encomendas, reservas, solicitações)', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let token: string
  let espacoId: string
  let solicitacaoId: string
  const auth = () => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    t = await createTestTenant(sql, 'moradorapp')

    // vincula o morador à unidade e cria dados dos módulos
    const reserved = await sql.reserve()
    try {
      await reserved.unsafe(`SET search_path TO ${t.schemaName}, public`)
      await reserved.unsafe(
        `INSERT INTO vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo, principal, criado_por)
         VALUES ($1, $2, $3, 'proprietario', true, $2)`,
        [uuidv4(), t.morador.pessoaId, t.unidadeId]
      )
      espacoId = uuidv4()
      await reserved.unsafe(`INSERT INTO espacos (id, nome) VALUES ($1, 'Salão de festas')`, [espacoId])
      await reserved.unsafe(
        `INSERT INTO encomendas (id, pessoa_id, unidade_id, remetente, status)
         VALUES ($1, $2, $3, 'Mercado Livre', 'aguardando')`,
        [uuidv4(), t.morador.pessoaId, t.unidadeId]
      )
      solicitacaoId = uuidv4()
      await reserved.unsafe(
        `INSERT INTO solicitacoes_acesso (id, nome, tipo, unidade_id, status)
         VALUES ($1, 'João Souza', 'visita', $2, 'pendente')`,
        [solicitacaoId, t.unidadeId]
      )
    } finally {
      await reserved.unsafe('SET search_path TO public')
      reserved.release()
    }

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

  it('resumo agrega unidade e contadores', async () => {
    const res = await app.inject({ method: 'GET', url: '/morador/resumo', headers: auth() })
    expect(res.statusCode).toBe(200)
    const d = res.json().data
    expect(d.unidade).toBe('101')
    expect(d.encomendas_aguardando).toBe(1)
    expect(d.visitantes_aguardando).toBe(1)
  })

  it('cria reserva e recusa data já ocupada', async () => {
    const ok = await app.inject({
      method: 'POST',
      url: '/morador/reservas',
      headers: auth(),
      payload: { espaco_id: espacoId, data: '2026-08-15', periodo: 'noite' },
    })
    expect(ok.statusCode).toBe(201)

    const conflito = await app.inject({
      method: 'POST',
      url: '/morador/reservas',
      headers: auth(),
      payload: { espaco_id: espacoId, data: '2026-08-15', periodo: 'noite' },
    })
    expect(conflito.statusCode).toBe(409)
    expect(conflito.json().erro.codigo).toBe('ESPACO_OCUPADO')
  })

  it('libera uma solicitação de visitante e zera o contador', async () => {
    const dec = await app.inject({
      method: 'PATCH',
      url: `/morador/solicitacoes/${solicitacaoId}`,
      headers: auth(),
      payload: { status: 'liberado' },
    })
    expect(dec.statusCode).toBe(200)
    expect(dec.json().data.status).toBe('liberado')

    const resumo = await app.inject({ method: 'GET', url: '/morador/resumo', headers: auth() })
    expect(resumo.json().data.visitantes_aguardando).toBe(0)
  })
})
