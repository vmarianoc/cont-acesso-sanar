import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('tempo real portaria ↔ morador (SSE)', () => {
  let app: FastifyInstance
  let baseUrl: string
  const sql = makeSql()
  let t: TestTenant
  let tokenPorteiro: string
  let tokenMorador: string

  const login = async (email: string, senha: string) =>
    (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, senha, tenant_id: t.tenantId },
      })
    ).json().data.token as string

  beforeAll(async () => {
    t = await createTestTenant(sql, 'rt')
    app = await buildApp()
    await app.listen({ port: 0, host: '127.0.0.1' })
    const addr = app.server.address() as { port: number }
    baseUrl = `http://127.0.0.1:${addr.port}`
    tokenPorteiro = await login(t.porteiro.email, t.porteiro.senha)
    tokenMorador = await login(t.morador.email, t.morador.senha)
    await sql.unsafe(
      `INSERT INTO ${t.schemaName}.vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo, ativo, principal)
       VALUES ($1, $2, $3, 'proprietario', true, true)`,
      [uuidv4(), t.morador.pessoaId, t.unidadeId]
    )
  }, 30000)

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  /** Abre o stream SSE e resolve com o primeiro evento cujo tipo casa com o filtro. */
  const esperarEvento = async (token: string, tipo: string, timeoutMs = 8000) => {
    const res = await fetch(`${baseUrl}/rt/stream?token=${encodeURIComponent(token)}`)
    expect(res.status).toBe(200)
    const reader = res.body!.getReader()
    const decoder = new TextDecoder()
    const inicio = Date.now()
    let buffer = ''
    try {
      while (Date.now() - inicio < timeoutMs) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value)
        for (const linha of buffer.split('\n')) {
          if (!linha.startsWith('data: ')) continue
          const evento = JSON.parse(linha.slice(6))
          if (evento.tipo === tipo) return evento
        }
      }
      throw new Error(`evento ${tipo} não chegou em ${timeoutMs}ms`)
    } finally {
      await reader.cancel().catch(() => {})
    }
  }

  it('rejeita stream sem token válido', async () => {
    const res = await fetch(`${baseUrl}/rt/stream?token=invalido`)
    expect(res.status).toBe(401)
  })

  it('morador recebe solicitação da portaria em tempo real', async () => {
    const eventoPromise = esperarEvento(tokenMorador, 'solicitacao_acesso')
    await new Promise((r) => setTimeout(r, 300)) // garante inscrição antes do publish

    const criar = await app.inject({
      method: 'POST',
      url: '/solicitacoes',
      headers: { authorization: `Bearer ${tokenPorteiro}` },
      payload: { nome: 'Entregador RT', unidade_id: t.unidadeId },
    })
    expect(criar.statusCode).toBe(201)

    const evento = await eventoPromise
    expect(evento.dados.nome).toBe('Entregador RT')
  })

  it('portaria recebe a decisão do morador em tempo real', async () => {
    const [pendente] = (
      await app.inject({
        method: 'GET',
        url: '/morador/solicitacoes',
        headers: { authorization: `Bearer ${tokenMorador}` },
      })
    ).json().data

    const eventoPromise = esperarEvento(tokenPorteiro, 'solicitacao_decidida')
    await new Promise((r) => setTimeout(r, 300))

    const decidir = await app.inject({
      method: 'PATCH',
      url: `/morador/solicitacoes/${pendente.id}`,
      headers: { authorization: `Bearer ${tokenMorador}` },
      payload: { status: 'liberado' },
    })
    expect(decidir.statusCode).toBe(200)

    const evento = await eventoPromise
    expect(evento.dados.status).toBe('liberado')
    expect(evento.dados.id).toBe(pendente.id)
  })
})
