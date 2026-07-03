import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'
import { gerarRamal, buscarRamalPorPessoa } from '../src/services/ramalSipService.js'

describe('ramalSipService', () => {
  const sql = makeSql()
  let t: TestTenant

  beforeAll(async () => {
    t = await createTestTenant(sql, 'ramalservice')
  })
  afterAll(async () => {
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('é idempotente: chamar duas vezes retorna o mesmo ramal', async () => {
    const reserved = await sql.reserve()
    try {
      await reserved.unsafe(`SET search_path TO ${t.schemaName}, public`)
      const r1 = await gerarRamal(reserved, t.morador.pessoaId)
      const r2 = await gerarRamal(reserved, t.morador.pessoaId)
      expect(r2.id).toBe(r1.id)
      expect(r2.numero).toBe(r1.numero)

      const encontrado = await buscarRamalPorPessoa(reserved, t.morador.pessoaId)
      expect(encontrado?.id).toBe(r1.id)
    } finally {
      await reserved.unsafe('SET search_path TO public')
      reserved.release()
    }
  })

  it('gera números diferentes para pessoas diferentes', async () => {
    const reserved = await sql.reserve()
    try {
      await reserved.unsafe(`SET search_path TO ${t.schemaName}, public`)
      const r1 = await gerarRamal(reserved, t.morador.pessoaId)
      const r2 = await gerarRamal(reserved, t.sindico.pessoaId)
      expect(r2.numero).not.toBe(r1.numero)
    } finally {
      await reserved.unsafe('SET search_path TO public')
      reserved.release()
    }
  })
})

describe('rotas de ramal SIP', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenSindico: string
  let tokenMorador: string
  const auth = (token: string) => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    t = await createTestTenant(sql, 'ramalroutes')

    const reserved = await sql.reserve()
    try {
      await reserved.unsafe(`SET search_path TO ${t.schemaName}, public`)
      await reserved.unsafe(
        `INSERT INTO vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo, principal, criado_por)
         VALUES ($1, $2, $3, 'proprietario', true, $2)`,
        [uuidv4(), t.morador.pessoaId, t.unidadeId]
      )
    } finally {
      await reserved.unsafe('SET search_path TO public')
      reserved.release()
    }

    app = await buildApp()
    await app.ready()
    const login = async (email: string, senha: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email, senha, tenant_id: t.tenantId },
        })
      ).json().data.token
    tokenSindico = await login(t.sindico.email, t.sindico.senha)
    tokenMorador = await login(t.morador.email, t.morador.senha)
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('GET /morador/ramal gera sob demanda para conta sem ramal ainda', async () => {
    const res = await app.inject({ method: 'GET', url: '/morador/ramal', headers: auth(tokenMorador) })
    expect(res.statusCode).toBe(200)
    const ramal = res.json().data
    expect(ramal.numero).toBeTruthy()
    expect(ramal.usuario_sip).toBe(ramal.numero)
    expect(ramal.senha_sip).toBeTruthy()
  })

  it('POST /usuarios com perfil morador gera o ramal automaticamente', async () => {
    const pessoaNova = await app.inject({
      method: 'POST',
      url: '/pessoas',
      headers: auth(tokenSindico),
      payload: { nome: 'Morador Novo Ramal', tipo: 'morador' },
    })
    expect(pessoaNova.statusCode).toBe(201)
    const pessoaId = pessoaNova.json().data.id

    const novoUsuario = await app.inject({
      method: 'POST',
      url: '/usuarios',
      headers: auth(tokenSindico),
      payload: {
        email: `morador-ramal-${t.tenantId}@test.com`,
        senha: 'senha123',
        perfil: 'morador',
        pessoa_id: pessoaId,
      },
    })
    expect(novoUsuario.statusCode).toBe(201)

    const reserved = await sql.reserve()
    try {
      await reserved.unsafe(`SET search_path TO ${t.schemaName}, public`)
      const ramal = await reserved.unsafe(`SELECT * FROM ramais_sip WHERE pessoa_id = $1`, [pessoaId])
      expect(ramal.length).toBe(1)
    } finally {
      await reserved.unsafe('SET search_path TO public')
      reserved.release()
    }
  })

  it('GET /unidades/:id/ramais lista ocupantes sem expor credenciais', async () => {
    // garante que o ramal do morador já existe antes de consultar pela unidade
    await app.inject({ method: 'GET', url: '/morador/ramal', headers: auth(tokenMorador) })

    const res = await app.inject({
      method: 'GET',
      url: `/unidades/${t.unidadeId}/ramais`,
      headers: auth(tokenSindico),
    })
    expect(res.statusCode).toBe(200)
    const ramais = res.json().data
    expect(ramais.length).toBe(1)
    expect(ramais[0]).toMatchObject({ pessoa_id: t.morador.pessoaId, pessoa_nome: t.moradorNome })
    expect(ramais[0].senha_sip).toBeUndefined()
  })
})
