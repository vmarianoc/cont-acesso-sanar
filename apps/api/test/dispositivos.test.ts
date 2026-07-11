import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('gestão de dispositivos por área', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenSindico: string
  let tokenMorador: string
  let dispositivoId: string

  const auth = (token: string) => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    t = await createTestTenant(sql, 'disp')
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
    tokenSindico = await login(t.sindico.email, t.sindico.senha)
    tokenMorador = await login(t.morador.email, t.morador.senha)
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('cria leitor facial vinculado a uma área', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/dispositivos',
      headers: auth(tokenSindico),
      payload: { nome: 'Leitor Piscina', tipo: 'leitor_facial', area: 'piscina' },
    })
    expect(res.statusCode).toBe(201)
    dispositivoId = res.json().data.id
    expect(res.json().data.area).toBe('piscina')
    expect(res.json().data.condominio_id).toBe(t.condominioId)
  })

  it('lista dispositivos com condomínio', async () => {
    const res = await app.inject({ method: 'GET', url: '/dispositivos', headers: auth(tokenSindico) })
    expect(res.statusCode).toBe(200)
    const novo = res.json().data.find((d: any) => d.id === dispositivoId)
    expect(novo.condominio_nome).toBeTruthy()
  })

  it('atualiza área e desativa dispositivo', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/dispositivos/${dispositivoId}`,
      headers: auth(tokenSindico),
      payload: { area: 'piscina_adulto', ativo: false },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.area).toBe('piscina_adulto')
    expect(res.json().data.ativo).toBe(false)
  })

  it('morador lê a lista mas não cria dispositivos', async () => {
    const lista = await app.inject({ method: 'GET', url: '/dispositivos', headers: auth(tokenMorador) })
    expect(lista.statusCode).toBe(200)

    const criar = await app.inject({
      method: 'POST',
      url: '/dispositivos',
      headers: auth(tokenMorador),
      payload: { nome: 'Hack', tipo: 'catraca', area: 'x' },
    })
    expect(criar.statusCode).toBe(403)
  })
})
