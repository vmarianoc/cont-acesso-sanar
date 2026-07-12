import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('fotos de acesso liberado (fila temporária do morador)', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenMorador: string

  const fotoFake = () => Buffer.from(`foto-${Math.random()}`).toString('base64')

  let tokenSindico: string

  const liberarComFoto = (foto_base64: string) =>
    app.inject({
      method: 'POST',
      url: '/edge/validate-access',
      headers: { authorization: `Bearer ${tokenSindico}` },
      payload: { schema_name: t.schemaName, dispositivo_id: t.dispositivoId, pessoa_id: t.morador.pessoaId, foto_base64 },
    })

  beforeAll(async () => {
    t = await createTestTenant(sql, 'fotosacesso')
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

    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    await sql.unsafe(
      `INSERT INTO vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo, ativo, principal)
       VALUES (gen_random_uuid(), $1, $2, 'inquilino', true, true)`,
      [t.morador.pessoaId, t.unidadeId]
    )
    await sql.unsafe(`SET search_path TO public`)
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('acesso liberado com foto aparece na fila do morador', async () => {
    const foto = fotoFake()
    const res = await liberarComFoto(foto)
    expect(res.json().data.resultado).toBe('liberado')

    const fila = await app.inject({
      method: 'GET',
      url: '/morador/fotos-acesso',
      headers: { authorization: `Bearer ${tokenMorador}` },
    })
    expect(fila.statusCode).toBe(200)
    const data = fila.json().data as any[]
    expect(data.length).toBeGreaterThan(0)
    expect(data[0].resultado).toBe('liberado')
    expect(Buffer.from(data[0].foto_base64, 'base64').toString()).toBe(Buffer.from(foto, 'base64').toString())
  })

  it('mantém só as 5 fotos mais recentes por unidade', async () => {
    for (let i = 0; i < 6; i++) {
      const res = await liberarComFoto(fotoFake())
      expect(res.json().data.resultado).toBe('liberado')
    }
    const fila = await app.inject({
      method: 'GET',
      url: '/morador/fotos-acesso',
      headers: { authorization: `Bearer ${tokenMorador}` },
    })
    expect(fila.json().data.length).toBe(5)
  })
})

describe('convite facial de visitante', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenMorador: string

  beforeAll(async () => {
    t = await createTestTenant(sql, 'convitefacial')
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

    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    await sql.unsafe(
      `INSERT INTO dispositivos (id, nome, tipo, condominio_id, ativo)
       VALUES (gen_random_uuid(), 'Facial Portaria', 'leitor_facial', $1, true)`,
      [t.condominioId]
    )
    await sql.unsafe(`SET search_path TO public`)
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('convite com foto enfileira comando visitante.face.criar para os leitores faciais', async () => {
    const agora = Date.now()
    const res = await app.inject({
      method: 'POST',
      url: '/morador/visitantes/pre-autorizar',
      headers: { authorization: `Bearer ${tokenMorador}` },
      payload: {
        nome: 'Visitante com Foto',
        unidade_id: t.unidadeId,
        valido_de: new Date(agora - 60_000).toISOString(),
        valido_ate: new Date(agora + 3_600_000).toISOString(),
        foto_base64: Buffer.from('foto-visitante').toString('base64'),
      },
    })
    expect(res.statusCode).toBe(201)
    const visitanteId = res.json().data.id

    const comandos = await sql.unsafe(
      `SELECT * FROM ${t.schemaName}.sync_queue WHERE tipo_comando = 'visitante.face.criar'`
    )
    expect(comandos.length).toBe(1)
    expect(comandos[0].payload.visitante_id).toBe(visitanteId)
    expect(comandos[0].payload.foto_base64).toBe(Buffer.from('foto-visitante').toString('base64'))
  })

  it('convite sem foto não enfileira comando facial', async () => {
    const agora = Date.now()
    const res = await app.inject({
      method: 'POST',
      url: '/morador/visitantes/pre-autorizar',
      headers: { authorization: `Bearer ${tokenMorador}` },
      payload: {
        nome: 'Visitante Sem Foto',
        unidade_id: t.unidadeId,
        valido_de: new Date(agora - 60_000).toISOString(),
        valido_ate: new Date(agora + 3_600_000).toISOString(),
      },
    })
    expect(res.statusCode).toBe(201)
    const visitanteId = res.json().data.id

    const comandos = await sql.unsafe(
      `SELECT * FROM ${t.schemaName}.sync_queue
       WHERE tipo_comando = 'visitante.face.criar' AND payload->>'visitante_id' = $1`,
      [visitanteId]
    )
    expect(comandos.length).toBe(0)
  })
})
