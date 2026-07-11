import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('login sem ID do condomínio (email/CPF + código da portaria)', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let codigo: string
  const CPF = '39053344705'

  beforeAll(async () => {
    t = await createTestTenant(sql, 'loginflex')
    app = await buildApp()
    await app.ready()
    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    await sql.unsafe(`UPDATE pessoas SET cpf = $1 WHERE id = $2`, [CPF, t.morador.pessoaId])
    const [tn] = await sql.unsafe(`SELECT codigo FROM public.tenants WHERE id = $1`, [t.tenantId])
    codigo = tn.codigo
    expect(codigo).toBeTruthy()
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('morador entra só com e-mail + senha (descoberta automática do condomínio)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identificador: t.morador.email, senha: t.morador.senha },
    })
    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data.token).toBeTruthy()
    expect(data.tenant_id).toBe(t.tenantId)
    expect(data.condominio).toBeTruthy()
  })

  it('morador entra com CPF + senha (com ou sem máscara)', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identificador: '390.533.447-05', senha: t.morador.senha },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.perfil).toBe('morador')
  })

  it('portaria entra com CPF + senha + código do condomínio', async () => {
    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    // dá um CPF ao porteiro (pessoa vinculada)
    const [u] = await sql.unsafe(`SELECT pessoa_id FROM usuarios_tenant WHERE email = $1`, [t.porteiro.email])
    await sql.unsafe(`UPDATE pessoas SET cpf = '52998224725' WHERE id = $1`, [u.pessoa_id])
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identificador: '529.982.247-25', senha: t.porteiro.senha, codigo_condominio: codigo.toLowerCase() },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.perfil).toBe('porteiro')
  })

  it('código de condomínio inválido é rejeitado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { identificador: t.porteiro.email, senha: t.porteiro.senha, codigo_condominio: 'ZZZZZZ' },
    })
    expect(res.statusCode).toBe(401)
    expect(res.json().erro.codigo).toBe('CONDOMINIO_INVALIDO')
  })

  it('credencial em dois condomínios pede escolha (409 CONTAS_MULTIPLAS)', async () => {
    const t2 = await createTestTenant(sql, 'loginflex2')
    try {
      // espelha o e-mail do morador no segundo tenant com a mesma senha
      await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
      const [orig] = await sql.unsafe(`SELECT senha_hash FROM usuarios_tenant WHERE email = $1`, [t.morador.email])
      await sql.unsafe(`SET search_path TO ${t2.schemaName}, public`)
      await sql.unsafe(
        `UPDATE usuarios_tenant SET email = $1, senha_hash = $2 WHERE email = $3`,
        [t.morador.email, orig.senha_hash, t2.morador.email]
      )
      const res = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identificador: t.morador.email, senha: t.morador.senha },
      })
      expect(res.statusCode).toBe(409)
      const corpo = res.json()
      expect(corpo.erro.codigo).toBe('CONTAS_MULTIPLAS')
      expect(corpo.data.contas.length).toBe(2)
      // reenvia com o tenant escolhido
      const res2 = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { identificador: t.morador.email, senha: t.morador.senha, tenant_id: t2.tenantId },
      })
      expect(res2.statusCode).toBe(200)
      expect(res2.json().data.tenant_id).toBe(t2.tenantId)
    } finally {
      await dropTestTenant(sql, t2)
    }
  })

  it('login antigo (email + tenant_id) segue funcionando', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: t.sindico.email, senha: t.sindico.senha, tenant_id: t.tenantId },
    })
    expect(res.statusCode).toBe(200)
  })
})
