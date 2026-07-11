import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('QR de visitante + auto-cadastro com disparo do síndico', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenSindico: string
  let tokenMorador: string
  let qrToken: string

  beforeAll(async () => {
    t = await createTestTenant(sql, 'regqr')
    app = await buildApp()
    await app.ready()
    const login = async (email: string, senha: string) =>
      (await app.inject({ method: 'POST', url: '/auth/login', payload: { email, senha, tenant_id: t.tenantId } })).json().data.token
    tokenSindico = await login(t.sindico.email, t.sindico.senha)
    tokenMorador = await login(t.morador.email, t.morador.senha)
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('pré-autorização gera qr_token e a portaria valida com dados de quem liberou', async () => {
    const criar = await app.inject({
      method: 'POST',
      url: '/morador/visitantes/pre-autorizar',
      headers: { authorization: `Bearer ${tokenMorador}` },
      payload: {
        nome: 'Visita QR',
        unidade_id: t.unidadeId,
        valido_de: new Date(Date.now() - 60000).toISOString(),
        valido_ate: new Date(Date.now() + 3600000).toISOString(),
      },
    })
    expect(criar.statusCode).toBe(201)
    qrToken = criar.json().data.qr_token
    expect(qrToken).toMatch(/^V-[A-Z0-9]+$/)

    const valida = await app.inject({
      method: 'POST',
      url: '/visitantes/validar-qr',
      headers: { authorization: `Bearer ${tokenSindico}` },
      payload: { qr_token: qrToken },
    })
    const { data } = valida.json()
    expect(data.resultado).toBe('liberado')
    expect(data.visitante.nome).toBe('Visita QR')
    expect(data.visitante.autorizado_por).toBe(t.moradorNome)
  })

  it('/edge/qr libera na janela e registra evento qrcode; expirado nega', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/edge/qr',
      headers: { authorization: `Bearer ${tokenSindico}` },
      payload: { schema_name: t.schemaName, dispositivo_id: t.dispositivoId, qr_token: qrToken },
    })
    expect(res.json().data.resultado).toBe('liberado')

    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    const eventos = await sql.unsafe(
      `SELECT 1 FROM eventos WHERE metodo = 'qrcode' AND dispositivo_id = $1`,
      [t.dispositivoId]
    )
    expect(eventos.length).toBeGreaterThan(0)

    await sql.unsafe(`UPDATE visitantes SET valido_ate = NOW() - INTERVAL '1 minute' WHERE qr_token = $1`, [qrToken])
    const expirado = await app.inject({
      method: 'POST',
      url: '/edge/qr',
      headers: { authorization: `Bearer ${tokenSindico}` },
      payload: { schema_name: t.schemaName, dispositivo_id: t.dispositivoId, qr_token: qrToken },
    })
    expect(expirado.json().data.resultado).toBe('negado')
    expect(expirado.json().data.motivo).toBe('CONVITE_EXPIRADO')
  })

  it('síndico dispara códigos; morador da lista confirma e já entra', async () => {
    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    const pessoaId = uuidv4()
    await sql.unsafe(
      `INSERT INTO pessoas (id, nome, email, cpf, tipo) VALUES ($1, 'Lista Fonte Aguas', 'lista@fonte.com', '11144477735', 'morador')`,
      [pessoaId]
    )
    const disparo = await app.inject({
      method: 'POST',
      url: '/registro/disparar',
      headers: { authorization: `Bearer ${tokenSindico}` },
      payload: {},
    })
    expect(disparo.statusCode).toBe(200)
    expect(disparo.json().data.enviados).toBeGreaterThan(0)

    const [cod] = await sql.unsafe(`SELECT codigo FROM registro_codigos WHERE pessoa_id = $1`, [pessoaId])
    expect(cod).toBeTruthy()

    // confirma com CPF + código e já sai logado
    const conf = await app.inject({
      method: 'POST',
      url: '/auth/registro/confirmar',
      payload: { identificador: '111.444.777-35', codigo: cod.codigo, senha: 'senhaForte1' },
    })
    expect(conf.statusCode).toBe(201)
    expect(conf.json().data.token).toBeTruthy()

    // código não pode ser reusado
    const denovo = await app.inject({
      method: 'POST',
      url: '/auth/registro/confirmar',
      payload: { identificador: 'lista@fonte.com', codigo: cod.codigo, senha: 'senhaForte1' },
    })
    expect(denovo.statusCode).toBe(400)
  })

  it('fora da lista → 404; solicitação cria aprovação; aprovar gera convite', async () => {
    const naoAchou = await app.inject({
      method: 'POST',
      url: '/auth/registro/confirmar',
      payload: { identificador: 'naoexiste@x.com', codigo: '123456', senha: 'senhaForte1' },
    })
    expect(naoAchou.statusCode).toBe(404)

    const sol = await app.inject({
      method: 'POST',
      url: '/auth/registro/solicitar',
      payload: {
        tenant_id: t.tenantId,
        nome: 'Novo Da Fonte',
        email: 'novo@fonte.com',
        cpf: '52998224725',
        unidade: '101',
      },
    })
    expect(sol.statusCode).toBe(201)

    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    const [ap] = await sql.unsafe(`SELECT id FROM aprovacoes WHERE tipo = 'novo_morador' ORDER BY criado_em DESC LIMIT 1`)
    expect(ap).toBeTruthy()

    const tokenAdmin = tokenSindico
    const aprovar = await app.inject({
      method: 'PATCH',
      url: `/aprovacoes/${ap.id}`,
      headers: { authorization: `Bearer ${tokenAdmin}` },
      payload: { status: 'aprovado' },
    })
    expect(aprovar.statusCode).toBe(200)

    const [pessoa] = await sql.unsafe(`SELECT id FROM pessoas WHERE email = 'novo@fonte.com'`)
    expect(pessoa).toBeTruthy()
    const [usuario] = await sql.unsafe(`SELECT id FROM usuarios_tenant WHERE email = 'novo@fonte.com'`)
    expect(usuario).toBeTruthy()
    const convites = await sql.unsafe(
      `SELECT 1 FROM tokens_conta WHERE usuario_id = $1 AND tipo = 'convite' AND usado_em IS NULL`,
      [usuario.id]
    )
    expect(convites.length).toBe(1)
  })
})
