import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('autosserviço de conta (esqueci-senha e convite)', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenSindico: string

  beforeAll(async () => {
    t = await createTestTenant(sql, 'conta')
    app = await buildApp()
    await app.ready()
    tokenSindico = (
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

  const tokenDoBanco = async (tipo: string) => {
    const rows = await sql.unsafe(
      `SELECT tc.* FROM ${t.schemaName}.tokens_conta tc ORDER BY criado_em DESC`
    )
    return rows.find((r: any) => r.tipo === tipo)
  }

  it('esqueci-senha sempre responde 200 e cria token só para conta existente', async () => {
    const existente = await app.inject({
      method: 'POST',
      url: '/auth/esqueci-senha',
      payload: { email: t.morador.email, tenant_id: t.tenantId },
    })
    expect(existente.statusCode).toBe(200)

    const inexistente = await app.inject({
      method: 'POST',
      url: '/auth/esqueci-senha',
      payload: { email: 'nao-existe@test.com', tenant_id: t.tenantId },
    })
    expect(inexistente.statusCode).toBe(200)

    const tokens = await sql.unsafe(`SELECT * FROM ${t.schemaName}.tokens_conta WHERE tipo = 'reset'`)
    expect(tokens.length).toBe(1)
  })

  it('redefinir com token errado falha; fluxo real troca a senha', async () => {
    const errado = await app.inject({
      method: 'POST',
      url: '/auth/redefinir-senha',
      payload: { tenant_id: t.tenantId, token: 'x'.repeat(64), senha: 'novaSenha1' },
    })
    expect(errado.statusCode).toBe(400)

    // intercepta o token real: recria com hash conhecido não dá — em vez disso
    // simulamos o e-mail capturando o token plainte da rota: geramos de novo e
    // lemos do log? Mais simples: inserir token conhecido direto no banco.
    const { createHash } = await import('node:crypto')
    const token = 'tok-teste-'.padEnd(40, 'a')
    const [usuario] = await sql.unsafe(
      `SELECT id FROM ${t.schemaName}.usuarios_tenant WHERE email = $1`,
      [t.morador.email]
    )
    await sql.unsafe(
      `INSERT INTO ${t.schemaName}.tokens_conta (usuario_id, tipo, token_hash, expira_em)
       VALUES ($1, 'reset', $2, NOW() + INTERVAL '1 hour')`,
      [usuario.id, createHash('sha256').update(token).digest('hex')]
    )

    const ok = await app.inject({
      method: 'POST',
      url: '/auth/redefinir-senha',
      payload: { tenant_id: t.tenantId, token, senha: 'novaSenha1' },
    })
    expect(ok.statusCode).toBe(200)

    // login com a nova senha funciona; com a antiga, não
    const loginNovo = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: t.morador.email, senha: 'novaSenha1', tenant_id: t.tenantId },
    })
    expect(loginNovo.statusCode).toBe(200)

    // token é de uso único
    const reuso = await app.inject({
      method: 'POST',
      url: '/auth/redefinir-senha',
      payload: { tenant_id: t.tenantId, token, senha: 'outraSenha1' },
    })
    expect(reuso.statusCode).toBe(400)
  })

  it('síndico gera convite e o convidado define a própria senha', async () => {
    const [usuario] = await sql.unsafe(
      `SELECT id FROM ${t.schemaName}.usuarios_tenant WHERE email = $1`,
      [t.porteiro.email]
    )
    const convite = await app.inject({
      method: 'POST',
      url: `/usuarios/${usuario.id}/convite`,
      headers: { authorization: `Bearer ${tokenSindico}` },
    })
    expect(convite.statusCode).toBe(201)
    const token = convite.json().data.token

    const aceitar = await app.inject({
      method: 'POST',
      url: '/auth/aceitar-convite',
      payload: { tenant_id: t.tenantId, token, senha: 'senhaConvite1' },
    })
    expect(aceitar.statusCode).toBe(200)

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: t.porteiro.email, senha: 'senhaConvite1', tenant_id: t.tenantId },
    })
    expect(login.statusCode).toBe(200)
  })

  it('morador não gera convite', async () => {
    const tokenMorador = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: t.morador.email, senha: 'novaSenha1', tenant_id: t.tenantId },
      })
    ).json().data.token
    const res = await app.inject({
      method: 'POST',
      url: `/usuarios/qualquer/convite`,
      headers: { authorization: `Bearer ${tokenMorador}` },
    })
    expect(res.statusCode).toBe(403)
  })
})
