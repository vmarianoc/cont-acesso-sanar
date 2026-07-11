import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('reservas v2 (regras) + presença de visitantes', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenMorador: string
  let tokenSindico: string
  let tokenPorteiro: string
  let espacoLivre: string
  let espacoAprovacao: string
  let leitorId: string

  const auth = (token: string) => ({ authorization: `Bearer ${token}` })
  const hoje = new Date().toISOString().slice(0, 10)

  beforeAll(async () => {
    t = await createTestTenant(sql, 'resv2')
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
    tokenSindico = await login(t.sindico.email, t.sindico.senha)
    tokenPorteiro = await login(t.porteiro.email, t.porteiro.senha)

    espacoLivre = uuidv4()
    espacoAprovacao = uuidv4()
    leitorId = uuidv4()
    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    await sql.unsafe(
      `INSERT INTO vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo, ativo, principal)
       VALUES ($1, $2, $3, 'proprietario', true, true)`,
      [uuidv4(), t.morador.pessoaId, t.unidadeId]
    )
    await sql.unsafe(
      `INSERT INTO espacos (id, nome, area, limite_mensal_por_unidade) VALUES ($1, 'Quadra', 'quadra', 2)`,
      [espacoLivre]
    )
    await sql.unsafe(
      `INSERT INTO espacos (id, nome, area, exige_aprovacao) VALUES ($1, 'Salão Nobre', 'salao_nobre', true)`,
      [espacoAprovacao]
    )
    await sql.unsafe(
      `INSERT INTO dispositivos (id, nome, tipo, condominio_id, area)
       VALUES ($1, 'Leitor Quadra', 'leitor_facial', $2, 'quadra')`,
      [leitorId, t.condominioId]
    )
    await sql.unsafe(`SET search_path TO public`)
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  const reservar = (espaco_id: string, data: string, periodo?: string) =>
    app.inject({
      method: 'POST',
      url: '/morador/reservas',
      headers: auth(tokenMorador),
      payload: { espaco_id, data, periodo },
    })

  it('valida antecedência máxima e data passada', async () => {
    const passada = await reservar(espacoLivre, '2020-01-01')
    expect(passada.json().erro.codigo).toBe('DATA_PASSADA')

    const longe = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10)
    const excedida = await reservar(espacoLivre, longe)
    expect(excedida.json().erro.codigo).toBe('ANTECEDENCIA_EXCEDIDA')
  })

  it('período inválido é rejeitado; períodos distintos no mesmo dia convivem', async () => {
    const invalido = await reservar(espacoLivre, hoje, 'madrugada')
    expect(invalido.json().erro.codigo).toBe('PERIODO_INVALIDO')

    const manha = await reservar(espacoLivre, hoje, 'manhã')
    expect(manha.statusCode).toBe(201)
    const tarde = await reservar(espacoLivre, hoje, 'tarde')
    expect(tarde.statusCode).toBe(201)

    const duplicada = await reservar(espacoLivre, hoje, 'manhã')
    expect(duplicada.json().erro.codigo).toBe('ESPACO_OCUPADO')
  })

  it('limite mensal por unidade bloqueia a terceira reserva', async () => {
    const noite = await reservar(espacoLivre, hoje, 'noite')
    expect(noite.json().erro.codigo).toBe('LIMITE_MENSAL')
  })

  it('liberação facial fica restrita à faixa do período', async () => {
    const libs = await sql.unsafe(
      `SELECT * FROM ${t.schemaName}.liberacoes_acesso
       WHERE pessoa_id = $1 AND area = 'quadra' AND ativo = true ORDER BY valido_de`,
      [t.morador.pessoaId]
    )
    expect(libs.length).toBe(2)
    const de = new Date(libs[0].valido_de)
    const ate = new Date(libs[0].valido_ate)
    expect(ate.getTime() - de.getTime()).toBeLessThanOrEqual(6 * 3600_000) // faixa, não o dia todo
  })

  it('cancelar reserva revoga a liberação', async () => {
    const reservas = (
      await app.inject({ method: 'GET', url: '/morador/reservas', headers: auth(tokenMorador) })
    ).json().data
    const alvo = reservas.find((r: any) => r.periodo === 'manhã')
    const del = await app.inject({
      method: 'DELETE',
      url: `/morador/reservas/${alvo.id}`,
      headers: auth(tokenMorador),
    })
    expect(del.statusCode).toBe(200)

    const libs = await sql.unsafe(
      `SELECT * FROM ${t.schemaName}.liberacoes_acesso WHERE origem_id = $1 AND ativo = true`,
      [alvo.id]
    )
    expect(libs.length).toBe(0)
  })

  it('espaço com aprovação: reserva nasce pendente e confirma no aprovado do síndico', async () => {
    const res = await reservar(espacoAprovacao, hoje, 'noite')
    expect(res.statusCode).toBe(201)
    expect(res.json().data.status).toBe('pendente')
    const reservaId = res.json().data.id

    const [aprovacao] = await sql.unsafe(
      `SELECT * FROM ${t.schemaName}.aprovacoes WHERE tipo = 'reserva_espaco' AND status = 'pendente'`
    )
    expect(aprovacao).toBeTruthy()

    const aprovar = await app.inject({
      method: 'PATCH',
      url: `/aprovacoes/${aprovacao.id}`,
      headers: auth(tokenSindico),
      payload: { status: 'aprovado' },
    })
    expect(aprovar.statusCode).toBe(200)

    const [reserva] = await sql.unsafe(
      `SELECT * FROM ${t.schemaName}.reservas WHERE id = $1`,
      [reservaId]
    )
    expect(reserva.status).toBe('confirmada')

    const libs = await sql.unsafe(
      `SELECT * FROM ${t.schemaName}.liberacoes_acesso WHERE origem_id = $1 AND ativo = true`,
      [reservaId]
    )
    expect(libs.length).toBe(1)
  })

  it('presença: entrada e saída do visitante, com lista de presentes', async () => {
    const criar = await app.inject({
      method: 'POST',
      url: '/morador/visitantes/pre-autorizar',
      headers: auth(tokenMorador),
      payload: {
        nome: 'Visita Presença',
        unidade_id: t.unidadeId,
        valido_de: new Date(Date.now() - 60_000).toISOString(),
        valido_ate: new Date(Date.now() + 3_600_000).toISOString(),
      },
    })
    const visitanteId = criar.json().data.id

    const esperados = await app.inject({ method: 'GET', url: '/visitantes', headers: auth(tokenPorteiro) })
    expect(esperados.json().data.some((v: any) => v.id === visitanteId)).toBe(true)

    const entrada = await app.inject({
      method: 'POST',
      url: `/visitantes/${visitanteId}/entrada`,
      headers: auth(tokenPorteiro),
    })
    expect(entrada.statusCode).toBe(200)

    const presentes = await app.inject({
      method: 'GET',
      url: '/visitantes/presentes',
      headers: auth(tokenPorteiro),
    })
    expect(presentes.json().data.some((v: any) => v.id === visitanteId)).toBe(true)

    const saida = await app.inject({
      method: 'POST',
      url: `/visitantes/${visitanteId}/saida`,
      headers: auth(tokenPorteiro),
    })
    expect(saida.statusCode).toBe(200)

    const depois = await app.inject({
      method: 'GET',
      url: '/visitantes/presentes',
      headers: auth(tokenPorteiro),
    })
    expect(depois.json().data.some((v: any) => v.id === visitanteId)).toBe(false)

    const saidaDupla = await app.inject({
      method: 'POST',
      url: `/visitantes/${visitanteId}/saida`,
      headers: auth(tokenPorteiro),
    })
    expect(saidaDupla.statusCode).toBe(409)
  })
})
