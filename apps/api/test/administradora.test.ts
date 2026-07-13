import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('painel da administradora (superadmin)', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenSuper: string
  let tokenSindico: string
  let novoTenantId: string

  const auth = (token: string) => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    t = await createTestTenant(sql, 'admrede')
    app = await buildApp()
    await app.ready()
    // promove o síndico de teste a superadmin num segundo usuário
    await sql.unsafe(
      `INSERT INTO ${t.schemaName}.usuarios_tenant (id, email, senha_hash, perfil)
       SELECT gen_random_uuid(), 'root-' || email, senha_hash, 'superadmin'
       FROM ${t.schemaName}.usuarios_tenant WHERE email = $1`,
      [t.sindico.email]
    ).catch(async () => {
      await sql.unsafe(
        `INSERT INTO ${t.schemaName}.usuarios_tenant (id, email, senha_hash, perfil)
         SELECT uuid_generate_v4(), 'root-' || email, senha_hash, 'superadmin'
         FROM ${t.schemaName}.usuarios_tenant WHERE email = $1`,
        [t.sindico.email]
      )
    })
    const login = async (email: string, senha: string) =>
      (
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email, senha, tenant_id: t.tenantId },
        })
      ).json().data.token as string
    tokenSuper = await login(`root-${t.sindico.email}`, t.sindico.senha)
    tokenSindico = await login(t.sindico.email, t.sindico.senha)
  })

  afterAll(async () => {
    if (novoTenantId) {
      const schema = `tenant_${novoTenantId.replace(/-/g, '_')}`
      await sql.unsafe(`DROP SCHEMA IF EXISTS ${schema} CASCADE`)
      await sql.unsafe(`DELETE FROM licencas WHERE tenant_id = $1`, [novoTenantId])
      await sql.unsafe(`DELETE FROM tenants WHERE id = $1`, [novoTenantId])
    }
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('síndico comum não acessa o painel da rede', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/resumo', headers: auth(tokenSindico) })
    expect(res.statusCode).toBe(403)
  })

  it('resumo e lista consolidada da rede', async () => {
    const resumo = await app.inject({ method: 'GET', url: '/admin/resumo', headers: auth(tokenSuper) })
    expect(resumo.statusCode).toBe(200)
    expect(resumo.json().data.condominios).toBeGreaterThan(0)

    const lista = await app.inject({ method: 'GET', url: '/admin/condominios', headers: auth(tokenSuper) })
    expect(lista.statusCode).toBe(200)
    const meu = lista.json().data.find((c: any) => c.id === t.tenantId)
    expect(meu).toBeTruthy()
    expect(typeof meu.unidades).toBe('number')
  })

  it('onboarding: cria condomínio com convite do síndico, que ativa a conta e loga', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/condominios',
      headers: auth(tokenSuper),
      payload: {
        nome: `Cond Onboarding ${Date.now()}`,
        plano: 'pro',
        sindico_email: 'novo-sindico@test.com',
        sindico_nome: 'Sindica Nova',
      },
    })
    expect(res.statusCode).toBe(201)
    const data = res.json().data
    novoTenantId = data.tenant_id
    expect(data.convite_sindico).toBeTruthy()

    const aceitar = await app.inject({
      method: 'POST',
      url: '/auth/aceitar-convite',
      payload: { tenant_id: novoTenantId, token: data.convite_sindico, senha: 'senhaNova1' },
    })
    expect(aceitar.statusCode).toBe(200)

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'novo-sindico@test.com', senha: 'senhaNova1', tenant_id: novoTenantId },
    })
    expect(login.statusCode).toBe(200)
    expect(login.json().data.perfil).toBe('sindico')
  })

  it('muda plano e desativa condomínio', async () => {
    const upd = await app.inject({
      method: 'PATCH',
      url: `/admin/condominios/${novoTenantId}`,
      headers: auth(tokenSuper),
      payload: { plano: 'start', ativo: false },
    })
    expect(upd.statusCode).toBe(200)
    expect(upd.json().data.plano).toBe('start')
    expect(upd.json().data.ativo).toBe(false)

    const [lic] = await sql.unsafe(`SELECT * FROM licencas WHERE tenant_id = $1`, [novoTenantId])
    expect(lic.max_unidades).toBe(50)
  })

  it('busca condomínio pela chave de licença', async () => {
    const [licenca] = await sql.unsafe(`SELECT license_key FROM licencas WHERE tenant_id = $1`, [t.tenantId])
    const res = await app.inject({
      method: 'GET',
      url: `/admin/condominios?busca=${encodeURIComponent(licenca.license_key)}`,
      headers: auth(tokenSuper),
    })
    expect(res.statusCode).toBe(200)
    const achado = res.json().data.find((c: any) => c.id === t.tenantId)
    expect(achado).toBeTruthy()
    expect(achado.license_key).toBe(licenca.license_key)
  })

  it('renova, suspende e desvincula hardware da licença', async () => {
    const [antes] = await sql.unsafe(`SELECT validade FROM licencas WHERE tenant_id = $1`, [t.tenantId])

    const renovar = await app.inject({
      method: 'PATCH',
      url: `/admin/condominios/${t.tenantId}/licenca`,
      headers: auth(tokenSuper),
      payload: { renovar_dias: 30 },
    })
    expect(renovar.statusCode).toBe(200)
    expect(new Date(renovar.json().data.validade).getTime()).toBeGreaterThan(new Date(antes.validade).getTime())

    await sql.unsafe(`UPDATE licencas SET edge_fingerprint = 'fp-de-teste' WHERE tenant_id = $1`, [t.tenantId])
    const desvincular = await app.inject({
      method: 'PATCH',
      url: `/admin/condominios/${t.tenantId}/licenca`,
      headers: auth(tokenSuper),
      payload: { desvincular_hardware: true, ativa: false },
    })
    expect(desvincular.statusCode).toBe(200)
    expect(desvincular.json().data.edge_fingerprint).toBeNull()
    expect(desvincular.json().data.ativa).toBe(false)

    // volta a licença ativa para não interferir em outros testes que reusam este tenant
    await sql.unsafe(`UPDATE licencas SET ativa = true WHERE tenant_id = $1`, [t.tenantId])
  })

  it('síndico comum não gerencia licença', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: `/admin/condominios/${t.tenantId}/licenca`,
      headers: auth(tokenSindico),
      payload: { renovar_dias: 30 },
    })
    expect(res.statusCode).toBe(403)
  })

  it('cria acesso de síndico direto (sem convite) e reseta senha ao repetir', async () => {
    const email = `sindico-direto-${Date.now()}@test.com`
    const criar = await app.inject({
      method: 'POST',
      url: `/admin/condominios/${t.tenantId}/sindico-acesso`,
      headers: auth(tokenSuper),
      payload: { email, nome: 'Síndico Direto' },
    })
    expect(criar.statusCode).toBe(200)
    const primeiraSenha = criar.json().data.senha
    expect(primeiraSenha).toBeTruthy()

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, senha: primeiraSenha, tenant_id: t.tenantId },
    })
    expect(login.statusCode).toBe(200)
    expect(login.json().data.perfil).toBe('sindico')

    const reset = await app.inject({
      method: 'POST',
      url: `/admin/condominios/${t.tenantId}/sindico-acesso`,
      headers: auth(tokenSuper),
      payload: { email, nome: 'Síndico Direto' },
    })
    const segundaSenha = reset.json().data.senha
    expect(segundaSenha).not.toBe(primeiraSenha)

    const loginComSenhaVelha = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email, senha: primeiraSenha, tenant_id: t.tenantId },
    })
    expect(loginComSenhaVelha.statusCode).toBe(401)
  })

  it('síndico comum não cria acesso de síndico', async () => {
    const res = await app.inject({
      method: 'POST',
      url: `/admin/condominios/${t.tenantId}/sindico-acesso`,
      headers: auth(tokenSindico),
      payload: { email: 'x@test.com', nome: 'X' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('gera o edge.config.json pronto do condomínio, com usuário do Edge criado', async () => {
    const res = await app.inject({
      method: 'GET',
      url: `/admin/condominios/${t.tenantId}/edge-config`,
      headers: auth(tokenSuper),
    })
    expect(res.statusCode).toBe(200)
    const config = JSON.parse(res.body)
    expect(config.tenant_id).toBe(t.tenantId)
    expect(config.schema_name).toBe(t.schemaName)
    expect(config.email).toContain('edge+')
    expect(config.senha).toBeTruthy()

    // usuário do Edge foi criado com perfil porteiro e a senha retornada funciona
    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: config.email, senha: config.senha, tenant_id: t.tenantId },
    })
    expect(login.statusCode).toBe(200)
    expect(login.json().data.perfil).toBe('porteiro')
  })

  it('mapeia leitor_facial (banco) para facial (edge.config.json)', async () => {
    const facialId = uuidv4()
    await sql.unsafe(
      `INSERT INTO ${t.schemaName}.dispositivos (id, nome, tipo, ativo) VALUES ($1, 'Facial Teste', 'leitor_facial', true)`,
      [facialId]
    )
    const res = await app.inject({
      method: 'GET',
      url: `/admin/condominios/${t.tenantId}/edge-config`,
      headers: auth(tokenSuper),
    })
    expect(res.statusCode).toBe(200)
    const dispositivo = JSON.parse(res.body).dispositivos.find((d: any) => d.dispositivo_id === facialId)
    expect(dispositivo).toBeTruthy()
    expect(dispositivo.tipo).toBe('facial')
  })

  it('baixar de novo reseta a senha do mesmo usuário do Edge (idempotente, sem duplicar)', async () => {
    const primeira = await app.inject({
      method: 'GET',
      url: `/admin/condominios/${t.tenantId}/edge-config`,
      headers: auth(tokenSuper),
    })
    const segunda = await app.inject({
      method: 'GET',
      url: `/admin/condominios/${t.tenantId}/edge-config`,
      headers: auth(tokenSuper),
    })
    const emailPrimeira = JSON.parse(primeira.body).email
    const emailSegunda = JSON.parse(segunda.body).email
    expect(emailPrimeira).toBe(emailSegunda)

    const usuarios = await sql.unsafe(
      `SELECT id FROM ${t.schemaName}.usuarios_tenant WHERE email = $1`,
      [emailSegunda]
    )
    expect(usuarios.length).toBe(1)
  })
})
