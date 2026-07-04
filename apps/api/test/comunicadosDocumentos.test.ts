import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('comunicados, grupos e documentos com escopo', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenSindico: string
  let tokenMorador: string
  let tokenPorteiro: string
  let comunicadoId: string
  let grupoId: string
  let docTodosId: string
  let docGrupoId: string

  const auth = (token: string) => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    t = await createTestTenant(sql, 'comdoc')
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
    tokenPorteiro = await login(t.porteiro.email, t.porteiro.senha)
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

  it('síndico publica comunicado; morador é notificado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/comunicados',
      headers: auth(tokenSindico),
      payload: { titulo: 'Falta de água', corpo: 'Manutenção amanhã das 8h às 12h.', prioridade: 'urgente' },
    })
    expect(res.statusCode).toBe(201)
    comunicadoId = res.json().data.id

    const notifs = await sql.unsafe(
      `SELECT * FROM ${t.schemaName}.notificacoes WHERE pessoa_id = $1 AND tipo = 'comunicado'`,
      [t.morador.pessoaId]
    )
    expect(notifs.length).toBe(1)
  })

  it('morador não publica comunicado', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/comunicados',
      headers: auth(tokenMorador),
      payload: { titulo: 'x', corpo: 'y' },
    })
    expect(res.statusCode).toBe(403)
  })

  it('morador lista, confirma leitura e o síndico vê a contagem', async () => {
    const antes = await app.inject({ method: 'GET', url: '/comunicados', headers: auth(tokenMorador) })
    const item = antes.json().data.find((c: any) => c.id === comunicadoId)
    expect(item.lido).toBe(false)

    const lida = await app.inject({
      method: 'POST',
      url: `/comunicados/${comunicadoId}/lida`,
      headers: auth(tokenMorador),
    })
    expect(lida.statusCode).toBe(200)

    const depois = await app.inject({ method: 'GET', url: '/comunicados', headers: auth(tokenSindico) })
    const doSindico = depois.json().data.find((c: any) => c.id === comunicadoId)
    expect(doSindico.leituras).toBe(1)
  })

  it('síndico cria grupo conselho fiscal e adiciona o morador', async () => {
    const grupo = await app.inject({
      method: 'POST',
      url: '/grupos',
      headers: auth(tokenSindico),
      payload: { nome: 'conselho_fiscal', descricao: 'Conselho Fiscal' },
    })
    expect(grupo.statusCode).toBe(201)
    grupoId = grupo.json().data.id

    const membro = await app.inject({
      method: 'POST',
      url: `/grupos/${grupoId}/membros`,
      headers: auth(tokenSindico),
      payload: { pessoa_id: t.morador.pessoaId },
    })
    expect(membro.statusCode).toBe(201)
  })

  const upload = (token: string, campos: Record<string, string>, nome = 'convencao.pdf') => {
    const boundary = '----docboundary'
    let corpo = ''
    for (const [k, v] of Object.entries(campos)) {
      corpo += `--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`
    }
    corpo += `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${nome}"\r\nContent-Type: application/pdf\r\n\r\nPDFCONTEUDO\r\n--${boundary}--\r\n`
    return app.inject({
      method: 'POST',
      url: '/documentos',
      headers: { ...auth(token), 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: corpo,
    })
  }

  it('publica documento para todos (convenção) e um restrito ao grupo', async () => {
    const todos = await upload(tokenSindico, { titulo: 'Convenção do condomínio', escopo: 'todos' })
    expect(todos.statusCode).toBe(201)
    docTodosId = todos.json().data.id

    const grupo = await upload(
      tokenSindico,
      { titulo: 'Balancete — conselho fiscal', escopo: 'grupo', grupo_id: grupoId },
      'balancete.pdf'
    )
    expect(grupo.statusCode).toBe(201)
    docGrupoId = grupo.json().data.id
  })

  it('membro do grupo vê os dois; não-membro (porteiro) só vê o público', async () => {
    const doMorador = (
      await app.inject({ method: 'GET', url: '/documentos', headers: auth(tokenMorador) })
    ).json().data
    expect(doMorador.map((d: any) => d.id)).toContain(docTodosId)
    expect(doMorador.map((d: any) => d.id)).toContain(docGrupoId)

    const doPorteiro = (
      await app.inject({ method: 'GET', url: '/documentos', headers: auth(tokenPorteiro) })
    ).json().data
    expect(doPorteiro.map((d: any) => d.id)).toContain(docTodosId)
    expect(doPorteiro.map((d: any) => d.id)).not.toContain(docGrupoId)
  })

  it('download respeita o escopo (404 para não-membro)', async () => {
    const ok = await app.inject({
      method: 'GET',
      url: `/documentos/${docGrupoId}/download`,
      headers: auth(tokenMorador),
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.body).toContain('PDFCONTEUDO')

    const negado = await app.inject({
      method: 'GET',
      url: `/documentos/${docGrupoId}/download`,
      headers: auth(tokenPorteiro),
    })
    expect(negado.statusCode).toBe(404)
  })
})
