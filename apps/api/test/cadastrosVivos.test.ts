import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('cadastros vivos: busca, pets, recorrência, pessoas', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenPorteiro: string
  let tokenMorador: string
  let tokenSindico: string
  let leitorServicoId: string

  const auth = (token: string) => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    t = await createTestTenant(sql, 'vivos')
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
    tokenPorteiro = await login(t.porteiro.email, t.porteiro.senha)
    tokenMorador = await login(t.morador.email, t.morador.senha)
    tokenSindico = await login(t.sindico.email, t.sindico.senha)

    leitorServicoId = uuidv4()
    await sql.unsafe(
      `INSERT INTO ${t.schemaName}.dispositivos (id, nome, tipo, condominio_id, area)
       VALUES ($1, 'Leitor Serviço', 'leitor_facial', $2, 'entrada_servico')`,
      [leitorServicoId, t.condominioId]
    )
    await sql.unsafe(
      `INSERT INTO ${t.schemaName}.vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo, ativo, principal)
       VALUES ($1, $2, $3, 'proprietario', true, true)`,
      [uuidv4(), t.morador.pessoaId, t.unidadeId]
    )
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('morador cadastra veículo com vaga e pet', async () => {
    const veiculo = await app.inject({
      method: 'POST',
      url: '/morador/veiculos',
      headers: auth(tokenMorador),
      payload: { placa: 'ABC1D23', modelo: 'Onix', vaga: 'G2-15' },
    })
    expect(veiculo.statusCode).toBe(201)
    expect(veiculo.json().data.vaga).toBe('G2-15')

    const pet = await app.inject({
      method: 'POST',
      url: '/morador/pets',
      headers: auth(tokenMorador),
      payload: { nome: 'Thor', especie: 'cachorro', raca: 'Vira-lata' },
    })
    expect(pet.statusCode).toBe(201)
  })

  it('busca unificada resolve placa → morador/unidade/vaga e pet', async () => {
    const placa = await app.inject({
      method: 'GET',
      url: '/busca?q=ABC1D',
      headers: auth(tokenPorteiro),
    })
    const rVeiculo = placa.json().data.find((r: any) => r.tipo === 'veiculo')
    expect(rVeiculo.titulo).toContain('ABC1D23')
    expect(rVeiculo.detalhe).toContain('101')
    expect(rVeiculo.detalhe).toContain('G2-15')

    const pet = await app.inject({ method: 'GET', url: '/busca?q=Thor', headers: auth(tokenPorteiro) })
    expect(pet.json().data.some((r: any) => r.tipo === 'pet')).toBe(true)

    const unidade = await app.inject({ method: 'GET', url: '/busca?q=101', headers: auth(tokenPorteiro) })
    expect(unidade.json().data.some((r: any) => r.tipo === 'unidade')).toBe(true)

    const negado = await app.inject({ method: 'GET', url: '/busca?q=101', headers: auth(tokenMorador) })
    expect(negado.statusCode).toBe(403)
  })

  it('liberação recorrente vale só no dia/horário configurado', async () => {
    const diaIso = ((new Date().getDay() + 6) % 7) + 1
    const criar = await app.inject({
      method: 'POST',
      url: '/liberacoes',
      headers: auth(tokenSindico),
      payload: {
        pessoa_id: t.porteiro.pessoaId,
        area: 'entrada_servico',
        valido_de: new Date(Date.now() - 86_400_000).toISOString(),
        valido_ate: new Date(Date.now() + 180 * 86_400_000).toISOString(),
        recorrencia: { dias: [diaIso], hora_inicio: '00:00', hora_fim: '23:59' },
      },
    })
    expect(criar.statusCode).toBe(201)

    const validar = (extra = {}) =>
      app.inject({
        method: 'POST',
        url: '/edge/validate-access',
        headers: auth(tokenSindico),
        payload: {
          schema_name: t.schemaName,
          dispositivo_id: leitorServicoId,
          pessoa_id: t.porteiro.pessoaId,
          ...extra,
        },
      })

    const hoje = await validar()
    expect(hoje.json().data.resultado).toBe('liberado')

    // muda a recorrência para outro dia da semana → negado
    const outroDia = (diaIso % 7) + 1
    await sql.unsafe(
      `UPDATE ${t.schemaName}.liberacoes_acesso
       SET recorrencia = $1::jsonb WHERE pessoa_id = $2 AND area = 'entrada_servico'`,
      [JSON.stringify({ dias: [outroDia], hora_inicio: '00:00', hora_fim: '23:59' }), t.porteiro.pessoaId]
    )
    const outro = await validar()
    expect(outro.json().data.resultado).toBe('negado')
  })

  it('síndico edita pessoa e vê a timeline', async () => {
    const upd = await app.inject({
      method: 'PATCH',
      url: `/pessoas/${t.morador.pessoaId}`,
      headers: auth(tokenSindico),
      payload: { telefone: '75 99999-0000' },
    })
    expect(upd.statusCode).toBe(200)
    expect(upd.json().data.telefone).toBe('75 99999-0000')

    const timeline = await app.inject({
      method: 'GET',
      url: `/pessoas/${t.morador.pessoaId}/timeline`,
      headers: auth(tokenSindico),
    })
    expect(timeline.statusCode).toBe(200)
    expect(timeline.json().data.some((e: any) => e.tipo === 'vinculo')).toBe(true)

    const negado = await app.inject({
      method: 'PATCH',
      url: `/pessoas/${t.morador.pessoaId}`,
      headers: auth(tokenMorador),
      payload: { nome: 'Hacker' },
    })
    expect(negado.statusCode).toBe(403)
  })
})
