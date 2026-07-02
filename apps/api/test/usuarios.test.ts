import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('gestão de usuários do tenant', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenSindico: string
  let tokenMorador: string
  const auth = (token: string) => ({ authorization: `Bearer ${token}` })

  const login = async (email: string, senha: string) =>
    (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, senha, tenant_id: t.tenantId },
      })
    ).json().data.token

  beforeAll(async () => {
    t = await createTestTenant(sql, 'usuarios')
    app = await buildApp()
    await app.ready()
    tokenSindico = await login(t.sindico.email, t.sindico.senha)
    tokenMorador = await login(t.morador.email, t.morador.senha)
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('morador não pode gerenciar usuários (403)', async () => {
    const res = await app.inject({ method: 'GET', url: '/usuarios', headers: auth(tokenMorador) })
    expect(res.statusCode).toBe(403)
    expect(res.json().erro.codigo).toBe('ACESSO_NEGADO')
  })

  it('lista usuários com nome da pessoa vinculada', async () => {
    const res = await app.inject({ method: 'GET', url: '/usuarios', headers: auth(tokenSindico) })
    expect(res.statusCode).toBe(200)
    const usuarios = res.json().data
    expect(usuarios.length).toBeGreaterThanOrEqual(3)
    const sindico = usuarios.find((u: any) => u.email === t.sindico.email)
    expect(sindico.pessoa_nome).toBeTruthy()
  })

  it('cria usuário vinculado a pessoa e rejeita e-mail duplicado', async () => {
    const semUsuario = await app.inject({
      method: 'GET',
      url: '/pessoas?sem_usuario=true',
      headers: auth(tokenSindico),
    })
    expect(semUsuario.statusCode).toBe(200)

    const novo = await app.inject({
      method: 'POST',
      url: '/usuarios',
      headers: auth(tokenSindico),
      payload: { email: `novo-${t.tenantId}@test.com`, senha: 'senha123', perfil: 'porteiro' },
    })
    expect(novo.statusCode).toBe(201)
    expect(novo.json().data.perfil).toBe('porteiro')

    const dup = await app.inject({
      method: 'POST',
      url: '/usuarios',
      headers: auth(tokenSindico),
      payload: { email: `novo-${t.tenantId}@test.com`, senha: 'senha123', perfil: 'porteiro' },
    })
    expect(dup.statusCode).toBe(409)
    expect(dup.json().erro.codigo).toBe('EMAIL_DUPLICADO')

    // novo usuário consegue logar
    const token = await login(`novo-${t.tenantId}@test.com`, 'senha123')
    expect(token).toBeTruthy()
  })

  it('desativa usuário (e ele perde o login), mas impede autodesativação', async () => {
    const usuarios = (
      await app.inject({ method: 'GET', url: '/usuarios', headers: auth(tokenSindico) })
    ).json().data
    const alvo = usuarios.find((u: any) => u.email === `novo-${t.tenantId}@test.com`)

    const off = await app.inject({
      method: 'PATCH',
      url: `/usuarios/${alvo.id}`,
      headers: auth(tokenSindico),
      payload: { ativo: false },
    })
    expect(off.statusCode).toBe(200)
    expect(off.json().data.ativo).toBe(false)

    const loginFalha = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: alvo.email, senha: 'senha123', tenant_id: t.tenantId },
    })
    expect(loginFalha.statusCode).toBe(401)

    const eu = usuarios.find((u: any) => u.email === t.sindico.email)
    const self = await app.inject({
      method: 'PATCH',
      url: `/usuarios/${eu.id}`,
      headers: auth(tokenSindico),
      payload: { ativo: false },
    })
    expect(self.statusCode).toBe(400)
    expect(self.json().erro.codigo).toBe('AUTO_DESATIVACAO')
  })
})
