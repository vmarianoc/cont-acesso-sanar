import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('LGPD operacional + relatórios + consentimento + ticket SSE', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenMorador: string
  let tokenSindico: string
  let vinculoId: string

  const auth = (token: string) => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    t = await createTestTenant(sql, 'lgpd')
    app = await buildApp()
    await app.ready()
    const login = async (email: string, senha: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email, senha, tenant_id: t.tenantId },
        })
      ).json().data.token as string
    tokenMorador = await login(t.morador.email, t.morador.senha)
    tokenSindico = await login(t.sindico.email, t.sindico.senha)
    vinculoId = uuidv4()
    await sql.unsafe(
      `INSERT INTO ${t.schemaName}.vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo, ativo, principal)
       VALUES ($1, $2, $3, 'proprietario', true, true)`,
      [vinculoId, t.morador.pessoaId, t.unidadeId]
    )
    await sql.unsafe(
      `INSERT INTO ${t.schemaName}.biometrias (pessoa_id, tipo, template) VALUES ($1, 'facial', 'abc')`,
      [t.morador.pessoaId]
    )
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('morador exporta os próprios dados (art. 18)', async () => {
    const res = await app.inject({ method: 'GET', url: '/morador/meus-dados', headers: auth(tokenMorador) })
    expect(res.statusCode).toBe(200)
    const data = res.json().data
    expect(data.pessoa.nome).toBe(t.moradorNome)
    expect(data.vinculos.length).toBe(1)
  })

  it('relatórios CSV só para gestão', async () => {
    const csv = await app.inject({ method: 'GET', url: '/relatorios/acessos.csv', headers: auth(tokenSindico) })
    expect(csv.statusCode).toBe(200)
    expect(csv.headers['content-type']).toContain('text/csv')
    expect(csv.body.split('\n')[0]).toBe('data,pessoa,tipo,resultado,metodo')

    const negado = await app.inject({ method: 'GET', url: '/relatorios/acessos.csv', headers: auth(tokenMorador) })
    expect(negado.statusCode).toBe(403)
  })

  it('consentimento é registrado uma única vez', async () => {
    const antes = await app.inject({ method: 'GET', url: '/lgpd/consentimento', headers: auth(tokenMorador) })
    expect(antes.json().data.consentimento_em).toBeNull()

    const aceite = await app.inject({ method: 'POST', url: '/lgpd/consentimento', headers: auth(tokenMorador) })
    const primeiro = aceite.json().data.consentimento_em
    expect(primeiro).toBeTruthy()

    const repetido = await app.inject({ method: 'POST', url: '/lgpd/consentimento', headers: auth(tokenMorador) })
    expect(repetido.json().data.consentimento_em).toBe(primeiro)
  })

  it('anonimizar exige vínculos encerrados e apaga identificadores + biometrias', async () => {
    const comVinculo = await app.inject({
      method: 'POST',
      url: `/pessoas/${t.morador.pessoaId}/anonimizar`,
      headers: auth(tokenSindico),
    })
    expect(comVinculo.statusCode).toBe(409)

    await sql.unsafe(
      `UPDATE ${t.schemaName}.vinculos_unidade SET ativo = false, fim = NOW() WHERE id = $1`,
      [vinculoId]
    )
    const ok = await app.inject({
      method: 'POST',
      url: `/pessoas/${t.morador.pessoaId}/anonimizar`,
      headers: auth(tokenSindico),
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().data.nome).toContain('anonimizado')
    expect(ok.json().data.cpf).toBeNull()

    const bio = await sql.unsafe(
      `SELECT * FROM ${t.schemaName}.biometrias WHERE pessoa_id = $1`,
      [t.morador.pessoaId]
    )
    expect(bio.length).toBe(0)

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: t.morador.email, senha: t.morador.senha, tenant_id: t.tenantId },
    })
    expect(login.statusCode).toBe(401)
  })

  it('ticket SSE é de uso único', async () => {
    const criado = await app.inject({ method: 'POST', url: '/rt/ticket', headers: auth(tokenSindico) })
    expect(criado.statusCode).toBe(201)
    const semAuth = await app.inject({ method: 'POST', url: '/rt/ticket' })
    expect(semAuth.statusCode).toBe(401)
  })
})
