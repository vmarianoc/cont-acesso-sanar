import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('liberação de acesso facial por área', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenMorador: string
  let tokenSindico: string
  let espacoId: string
  let leitorSalaoId: string
  let leitorPiscinaId: string

  const login = async (email: string, senha: string) =>
    (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, senha, tenant_id: t.tenantId },
      })
    ).json().data.token as string

  const validar = (dispositivo_id: string, extra: Record<string, string>) =>
    app.inject({
      method: 'POST',
      url: '/edge/validate-access',
      headers: { authorization: `Bearer ${tokenSindico}` },
      payload: { schema_name: t.schemaName, dispositivo_id, ...extra },
    })

  beforeAll(async () => {
    t = await createTestTenant(sql, 'acesso')
    app = await buildApp()
    await app.ready()
    tokenMorador = await login(t.morador.email, t.morador.senha)
    tokenSindico = await login(t.sindico.email, t.sindico.senha)

    espacoId = uuidv4()
    leitorSalaoId = uuidv4()
    leitorPiscinaId = uuidv4()
    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    await sql.unsafe(
      `INSERT INTO espacos (id, nome, area, periodos) VALUES ($1, 'Salão Teste', 'salao_teste', '[{\"nome\":\"dia\",\"inicio\":\"00:00\",\"fim\":\"23:59\"}]')`,
      [espacoId]
    )
    await sql.unsafe(
      `INSERT INTO dispositivos (id, nome, tipo, condominio_id, area)
       VALUES ($1, 'Leitor Salão', 'leitor_facial', $2, 'salao_teste'),
              ($3, 'Leitor Piscina', 'leitor_facial', $2, 'piscina')`,
      [leitorSalaoId, t.condominioId, leitorPiscinaId]
    )
    // morador com vínculo ativo na unidade (acesso residencial)
    await sql.unsafe(
      `INSERT INTO vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo, ativo, principal)
       VALUES ($1, $2, $3, 'inquilino', true, true)`,
      [uuidv4(), t.morador.pessoaId, t.unidadeId]
    )
    await sql.unsafe(`SET search_path TO public`)
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('denies access to an area without any liberação and logs the event', async () => {
    const res = await validar(leitorSalaoId, { pessoa_id: t.porteiro.pessoaId })
    expect(res.statusCode).toBe(200)
    expect(res.json().data.resultado).toBe('negado')
    expect(res.json().data.motivo).toBe('SEM_LIBERACAO_PARA_AREA')

    const eventos = await sql.unsafe(
      `SELECT * FROM ${t.schemaName}.eventos WHERE tipo = 'acesso_area' AND resultado = 'negado'`
    )
    expect(eventos.length).toBeGreaterThan(0)
    expect(eventos[0].metodo).toBe('facial')
  })

  it('morador with active vínculo enters portaria (residential access)', async () => {
    const res = await validar(t.dispositivoId, { pessoa_id: t.morador.pessoaId })
    expect(res.json().data.resultado).toBe('liberado')
    expect(res.json().data.motivo).toBe('MORADOR_ATIVO')
  })

  it('reserva de espaço gera liberação facial temporária para a área do espaço', async () => {
    const hoje = new Date().toISOString().slice(0, 10)
    const reserva = await app.inject({
      method: 'POST',
      url: '/morador/reservas',
      headers: { authorization: `Bearer ${tokenMorador}` },
      payload: { espaco_id: espacoId, data: hoje, periodo: 'dia' },
    })
    expect(reserva.statusCode).toBe(201)

    // liberado na área do espaço reservado…
    const salao = await validar(leitorSalaoId, { pessoa_id: t.morador.pessoaId })
    expect(salao.json().data.resultado).toBe('liberado')
    expect(salao.json().data.motivo).toBe('LIBERACAO_VIGENTE')

    // …mas não em outra área
    const piscina = await validar(leitorPiscinaId, { pessoa_id: t.morador.pessoaId })
    expect(piscina.json().data.resultado).toBe('negado')
  })

  it('pré-autorização de visitante libera a portaria apenas dentro da janela', async () => {
    const agora = Date.now()
    const criar = await app.inject({
      method: 'POST',
      url: '/morador/visitantes/pre-autorizar',
      headers: { authorization: `Bearer ${tokenMorador}` },
      payload: {
        nome: 'Visitante Facial',
        unidade_id: t.unidadeId,
        valido_de: new Date(agora - 60_000).toISOString(),
        valido_ate: new Date(agora + 3_600_000).toISOString(),
      },
    })
    expect(criar.statusCode).toBe(201)
    const visitanteId = criar.json().data.id

    const dentro = await validar(t.dispositivoId, { visitante_id: visitanteId })
    expect(dentro.json().data.resultado).toBe('liberado')

    // expira a janela e o mesmo visitante é negado
    await sql.unsafe(
      `UPDATE ${t.schemaName}.liberacoes_acesso SET valido_ate = NOW() - INTERVAL '1 minute'
       WHERE visitante_id = $1`,
      [visitanteId]
    )
    const fora = await validar(t.dispositivoId, { visitante_id: visitanteId })
    expect(fora.json().data.resultado).toBe('negado')
  })

  it('liberação manual pode ser criada e revogada pelo síndico', async () => {
    const criar = await app.inject({
      method: 'POST',
      url: '/liberacoes',
      headers: { authorization: `Bearer ${tokenSindico}` },
      payload: {
        pessoa_id: t.porteiro.pessoaId,
        area: 'piscina',
        valido_de: new Date(Date.now() - 60_000).toISOString(),
        valido_ate: new Date(Date.now() + 3_600_000).toISOString(),
      },
    })
    expect(criar.statusCode).toBe(201)
    const liberacaoId = criar.json().data.id

    const liberado = await validar(leitorPiscinaId, { pessoa_id: t.porteiro.pessoaId })
    expect(liberado.json().data.resultado).toBe('liberado')

    const revogar = await app.inject({
      method: 'DELETE',
      url: `/liberacoes/${liberacaoId}`,
      headers: { authorization: `Bearer ${tokenSindico}` },
    })
    expect(revogar.statusCode).toBe(200)

    const negado = await validar(leitorPiscinaId, { pessoa_id: t.porteiro.pessoaId })
    expect(negado.json().data.resultado).toBe('negado')
  })

  it('morador não pode gerenciar liberações', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/liberacoes',
      headers: { authorization: `Bearer ${tokenMorador}` },
    })
    expect(res.statusCode).toBe(403)
  })
})
