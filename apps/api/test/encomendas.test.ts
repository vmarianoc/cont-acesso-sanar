import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('gestão de encomendas', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenPorteiro: string
  let tokenMorador: string
  let encomendaId: string
  let codigo: string

  const auth = (token: string) => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    t = await createTestTenant(sql, 'encomendas')
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
    tokenPorteiro = await login(t.porteiro.email, t.porteiro.senha)
    tokenMorador = await login(t.morador.email, t.morador.senha)

    // morador é o responsável (principal) da unidade
    await sql.unsafe(
      `INSERT INTO ${t.schemaName}.vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo, ativo, principal)
       VALUES ($1, $2, $3, 'proprietario', true, true)`,
      [uuidv4(), t.morador.pessoaId, t.unidadeId]
    )
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('registra encomenda, resolve destinatário pelo vínculo principal e notifica', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/encomendas',
      headers: auth(tokenPorteiro),
      payload: { unidade_id: t.unidadeId, remetente: 'Loja Teste', prateleira: 'B2' },
    })
    expect(res.statusCode).toBe(201)
    const data = res.json().data
    encomendaId = data.id
    codigo = data.codigo_retirada
    expect(data.pessoa_id).toBe(t.morador.pessoaId)
    expect(codigo).toMatch(/^\d{4}$/)

    const notifs = await sql.unsafe(
      `SELECT * FROM ${t.schemaName}.notificacoes WHERE pessoa_id = $1 AND titulo = 'Encomenda na portaria'`,
      [t.morador.pessoaId]
    )
    expect(notifs.length).toBe(1)
  })

  it('lista encomendas com nome do destinatário e número da unidade', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/encomendas?status=aguardando',
      headers: auth(tokenPorteiro),
    })
    expect(res.statusCode).toBe(200)
    const item = res.json().data.find((e: any) => e.id === encomendaId)
    expect(item.pessoa_nome).toBe(t.moradorNome)
    expect(item.unidade_numero).toBe('101')
  })

  it('recusa retirada com código errado', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/encomendas/${encomendaId}/retirar`,
      headers: auth(tokenPorteiro),
      payload: { codigo_retirada: '0000' },
    })
    expect(res.statusCode).toBe(403)
    expect(res.json().erro.codigo).toBe('CODIGO_INVALIDO')
  })

  it('confirma retirada com o código correto e bloqueia dupla retirada', async () => {
    const ok = await app.inject({
      method: 'PATCH',
      url: `/encomendas/${encomendaId}/retirar`,
      headers: auth(tokenPorteiro),
      payload: { codigo_retirada: codigo },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().data.status).toBe('retirada')

    const dupla = await app.inject({
      method: 'PATCH',
      url: `/encomendas/${encomendaId}/retirar`,
      headers: auth(tokenPorteiro),
      payload: { codigo_retirada: codigo },
    })
    expect(dupla.statusCode).toBe(409)
  })

  it('morador não gerencia encomendas', async () => {
    const res = await app.inject({ method: 'GET', url: '/encomendas', headers: auth(tokenMorador) })
    expect(res.statusCode).toBe(403)
  })
})
