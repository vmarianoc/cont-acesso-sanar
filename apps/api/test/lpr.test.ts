import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('acesso veicular por LPR (placa)', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenPorteiro: string
  let cameraPortariaId: string
  let cameraGaragemId: string

  const lpr = (dispositivo_id: string, placa: string) =>
    app.inject({
      method: 'POST',
      url: '/edge/lpr',
      headers: { authorization: `Bearer ${tokenPorteiro}` },
      payload: { schema_name: t.schemaName, dispositivo_id, placa },
    })

  beforeAll(async () => {
    t = await createTestTenant(sql, 'lpr')
    app = await buildApp()
    await app.ready()
    tokenPorteiro = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: t.porteiro.email, senha: t.porteiro.senha, tenant_id: t.tenantId },
      })
    ).json().data.token as string

    cameraPortariaId = uuidv4()
    cameraGaragemId = uuidv4()
    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    await sql.unsafe(
      `INSERT INTO dispositivos (id, nome, tipo, condominio_id, area)
       VALUES ($1, 'LPR Entrada', 'lpr', $2, 'portaria'),
              ($3, 'LPR Garagem Visitas', 'lpr', $2, 'garagem_visitas')`,
      [cameraPortariaId, t.condominioId, cameraGaragemId]
    )
    // morador com vínculo ativo e veículo cadastrado
    await sql.unsafe(
      `INSERT INTO vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo, ativo, principal)
       VALUES ($1, $2, $3, 'proprietario', true, true)`,
      [uuidv4(), t.morador.pessoaId, t.unidadeId]
    )
    await sql.unsafe(
      `INSERT INTO veiculos (id, pessoa_id, placa, modelo, ativo) VALUES ($1, $2, 'ABC1D23', 'Onix', true)`,
      [uuidv4(), t.morador.pessoaId]
    )
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('libera morador ativo pela placa na portaria (com normalização)', async () => {
    const res = await lpr(cameraPortariaId, 'abc-1d23')
    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data.resultado).toBe('liberado')
    expect(data.motivo).toBe('MORADOR_ATIVO')
    expect(data.placa).toBe('ABC1D23')
    expect(data.pessoa_nome).toBe(t.moradorNome)
  })

  it('nega placa desconhecida e registra o evento com metodo placa', async () => {
    const res = await lpr(cameraPortariaId, 'ZZZ9Z99')
    expect(res.statusCode).toBe(200)
    const { data } = res.json()
    expect(data.resultado).toBe('negado')
    expect(data.motivo).toBe('PLACA_DESCONHECIDA')

    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    const eventos = await sql.unsafe(
      `SELECT resultado, metodo FROM eventos WHERE dispositivo_id = $1 AND metodo = 'placa' ORDER BY criado_em DESC`,
      [cameraPortariaId]
    )
    expect(eventos.length).toBeGreaterThanOrEqual(2) // liberado + negado
    expect(eventos.some((e: any) => e.resultado === 'negado')).toBe(true)
  })

  it('em área restrita, placa de morador só entra com liberação vigente', async () => {
    const negado = await lpr(cameraGaragemId, 'ABC1D23')
    expect(negado.json().data.resultado).toBe('negado')
    expect(negado.json().data.motivo).toBe('SEM_LIBERACAO_PARA_AREA')

    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    await sql.unsafe(
      `INSERT INTO liberacoes_acesso (id, pessoa_id, area, metodo, valido_de, valido_ate, origem_tipo)
       VALUES ($1, $2, 'garagem_visitas', 'manual', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '1 hour', 'manual')`,
      [uuidv4(), t.morador.pessoaId]
    )
    const liberado = await lpr(cameraGaragemId, 'ABC1D23')
    expect(liberado.json().data.resultado).toBe('liberado')
    expect(liberado.json().data.motivo).toBe('LIBERACAO_VIGENTE')
  })

  it('nega dispositivo desconhecido sem registrar evento', async () => {
    const res = await lpr(uuidv4(), 'ABC1D23')
    expect(res.json().data.motivo).toBe('DISPOSITIVO_DESCONHECIDO')
  })
})

describe('cache de placas para o Edge (modo degradado)', () => {
  // reusa a infra do describe acima via novo tenant leve
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant

  beforeAll(async () => {
    t = await createTestTenant(sql, 'lprcache')
    app = await buildApp()
    await app.ready()
    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    await sql.unsafe(
      `INSERT INTO vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo, ativo, principal)
       VALUES ($1, $2, $3, 'proprietario', true, true)`,
      [uuidv4(), t.morador.pessoaId, t.unidadeId]
    )
    await sql.unsafe(
      `INSERT INTO veiculos (id, pessoa_id, placa, ativo) VALUES ($1, $2, 'CACHE01', true)`,
      [uuidv4(), t.morador.pessoaId]
    )
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('lista placa→pessoa de moradores ativos', async () => {
    const token = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: t.porteiro.email, senha: t.porteiro.senha, tenant_id: t.tenantId },
      })
    ).json().data.token
    const res = await app.inject({
      method: 'GET',
      url: `/edge/sync/placas?schema_name=${t.schemaName}`,
      headers: { authorization: `Bearer ${token}` },
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.CACHE01).toBe(t.morador.pessoaId)
  })
})
