import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('unidades + ocupantes', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let token: string
  const auth = () => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    t = await createTestTenant(sql, 'unidades')
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

  it('lists unidades with joined bloco and condominio', async () => {
    const res = await app.inject({ method: 'GET', url: '/unidades', headers: auth() })
    expect(res.statusCode).toBe(200)
    const data = res.json().data
    expect(data.length).toBeGreaterThan(0)
    expect(data[0].bloco.nome).toBeTruthy()
    expect(data[0].condominio.nome).toBeTruthy()
  })

  it('creates a unidade and rejects duplicates in the same bloco', async () => {
    const create = await app.inject({
      method: 'POST',
      url: '/unidades',
      headers: auth(),
      payload: { bloco_id: t.blocoId, numero: '202', andar: 2 },
    })
    expect(create.statusCode).toBe(201)
    expect(create.json().data.numero).toBe('202')

    const dup = await app.inject({
      method: 'POST',
      url: '/unidades',
      headers: auth(),
      payload: { bloco_id: t.blocoId, numero: '202' },
    })
    expect(dup.statusCode).toBe(409)
    expect(dup.json().erro.codigo).toBe('UNIDADE_DUPLICADA')
  })

  it('enforces exactly one active principal per unidade', async () => {
    // first occupant as principal
    const r1 = await app.inject({
      method: 'POST',
      url: `/unidades/${t.unidadeId}/ocupantes`,
      headers: auth(),
      payload: { pessoa_id: t.morador.pessoaId, tipo_vinculo: 'proprietario', principal: true },
    })
    expect(r1.statusCode).toBe(201)
    expect(r1.json().data.principal).toBe(true)

    // second occupant as principal -> should demote the first
    const r2 = await app.inject({
      method: 'POST',
      url: `/unidades/${t.unidadeId}/ocupantes`,
      headers: auth(),
      payload: { pessoa_id: t.sindico.pessoaId, tipo_vinculo: 'inquilino', principal: true },
    })
    expect(r2.statusCode).toBe(201)

    const ocupantes = await app.inject({
      method: 'GET',
      url: `/unidades/${t.unidadeId}/ocupantes`,
      headers: auth(),
    })
    const principais = ocupantes.json().data.filter((o: any) => o.principal)
    expect(principais.length).toBe(1)
    expect(principais[0].pessoa_id).toBe(t.sindico.pessoaId)
  })

  it('ends a vínculo (soft) so it drops out of active occupants', async () => {
    const ocupantes = (
      await app.inject({ method: 'GET', url: `/unidades/${t.unidadeId}/ocupantes`, headers: auth() })
    ).json().data
    const alvo = ocupantes[0]
    const del = await app.inject({
      method: 'DELETE',
      url: `/unidades/${t.unidadeId}/ocupantes/${alvo.id}`,
      headers: auth(),
    })
    expect(del.statusCode).toBe(200)

    const depois = (
      await app.inject({ method: 'GET', url: `/unidades/${t.unidadeId}/ocupantes`, headers: auth() })
    ).json().data
    expect(depois.find((o: any) => o.id === alvo.id)).toBeUndefined()
  })
})
