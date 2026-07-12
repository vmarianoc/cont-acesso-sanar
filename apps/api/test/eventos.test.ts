import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('GET /eventos', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let token: string

  beforeAll(async () => {
    t = await createTestTenant(sql, 'eventos')
    app = await buildApp()
    await app.ready()
    token = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: t.porteiro.email, senha: t.porteiro.senha, tenant_id: t.tenantId },
      })
    ).json().data.token
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('returns events with joined pessoa.nome', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/eventos?limit=10',
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    const eventos = res.json().data
    expect(eventos.length).toBeGreaterThan(0)
    expect(eventos[0]).toHaveProperty('pessoa')
    expect(eventos[0].pessoa.nome).toBe(t.moradorNome)
  })

  it('requires authentication', async () => {
    const res = await app.inject({ method: 'GET', url: '/eventos' })
    expect(res.statusCode).toBe(401)
  })

  it('registers a manual event', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/eventos',
      headers: { authorization: `Bearer ${token}` },
      payload: { dispositivo_id: t.dispositivoId, tipo: 'acesso_manual', resultado: 'liberado', metodo: 'manual' },
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().data.metodo).toBe('manual')
  })

  it('inclui foto_base64 quando o acesso liberado tem foto (e null quando não tem)', async () => {
    await sql.unsafe(
      `INSERT INTO ${t.schemaName}.vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo, ativo, principal)
       VALUES ($1, $2, $3, 'proprietario', true, true)`,
      [uuidv4(), t.morador.pessoaId, t.unidadeId]
    )
    const foto = Buffer.from('foto-evento-teste').toString('base64')
    const validar = await app.inject({
      method: 'POST',
      url: '/edge/validate-access',
      headers: { authorization: `Bearer ${token}` },
      payload: {
        schema_name: t.schemaName,
        dispositivo_id: t.dispositivoId,
        pessoa_id: t.morador.pessoaId,
        foto_base64: foto,
      },
    })
    expect(validar.statusCode).toBe(200)

    const res = await app.inject({
      method: 'GET',
      url: '/eventos?limit=5',
      headers: { authorization: `Bearer ${token}` },
    })
    const eventos = res.json().data as any[]
    const comFoto = eventos.find((e) => e.foto_base64)
    expect(comFoto).toBeTruthy()
    expect(comFoto.foto_base64).toBe(foto)

    const semFoto = eventos.find((e) => e.metodo === 'manual')
    expect(semFoto.foto_base64).toBeNull()
  })
})
