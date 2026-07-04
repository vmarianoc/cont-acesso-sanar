import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('livro de ocorrências', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenPorteiro: string
  let tokenMorador: string
  let tokenSindico: string
  let ocorrenciaId: string

  const auth = (token: string) => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    t = await createTestTenant(sql, 'ocor')
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
    tokenSindico = await login(t.sindico.email, t.sindico.senha)
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('porteiro abre ocorrência com unidade', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ocorrencias',
      headers: auth(tokenPorteiro),
      payload: {
        titulo: 'Vazamento na garagem',
        descricao: 'Água acumulando perto da vaga 12.',
        categoria: 'manutencao',
        unidade_id: t.unidadeId,
      },
    })
    expect(res.statusCode).toBe(201)
    ocorrenciaId = res.json().data.id
    expect(res.json().data.status).toBe('aberta')
  })

  it('morador abre a própria e só enxerga as dele', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/ocorrencias',
      headers: auth(tokenMorador),
      payload: { titulo: 'Barulho no 202', descricao: 'Festa após as 23h.', categoria: 'barulho' },
    })
    expect(res.statusCode).toBe(201)

    const lista = await app.inject({ method: 'GET', url: '/ocorrencias', headers: auth(tokenMorador) })
    const titulos = lista.json().data.map((o: any) => o.titulo)
    expect(titulos).toContain('Barulho no 202')
    expect(titulos).not.toContain('Vazamento na garagem')
  })

  it('síndico vê tudo, comenta e resolve', async () => {
    const lista = await app.inject({ method: 'GET', url: '/ocorrencias', headers: auth(tokenSindico) })
    expect(lista.json().data.length).toBeGreaterThanOrEqual(2)

    const upd = await app.inject({
      method: 'PATCH',
      url: `/ocorrencias/${ocorrenciaId}`,
      headers: auth(tokenSindico),
      payload: { status: 'resolvida', comentario: 'Zelador trocou a vedação.' },
    })
    expect(upd.statusCode).toBe(200)
    expect(upd.json().data.status).toBe('resolvida')
    expect(upd.json().data.resolvido_em).toBeTruthy()

    const depois = await app.inject({ method: 'GET', url: '/ocorrencias', headers: auth(tokenSindico) })
    const item = depois.json().data.find((o: any) => o.id === ocorrenciaId)
    expect(item.comentarios.length).toBe(1)
  })

  it('morador não muda status', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/ocorrencias/${ocorrenciaId}`,
      headers: auth(tokenMorador),
      payload: { status: 'aberta' },
    })
    expect(res.statusCode).toBe(403)
  })
})
