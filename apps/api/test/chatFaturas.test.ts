import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('chat portaria↔morador + billing Cora', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenPorteiro: string
  let tokenMorador: string
  let tokenSuper: string
  let faturaId: string
  let coraInvoiceId: string

  const auth = (token: string) => ({ authorization: `Bearer ${token}` })

  beforeAll(async () => {
    process.env.CORA_WEBHOOK_SECRET = 'segredo-teste'
    t = await createTestTenant(sql, 'chatbill')
    app = await buildApp()
    await app.ready()
    await sql.unsafe(
      `INSERT INTO ${t.schemaName}.usuarios_tenant (id, email, senha_hash, perfil)
       SELECT uuid_generate_v4(), 'root-' || email, senha_hash, 'superadmin'
       FROM ${t.schemaName}.usuarios_tenant WHERE email = $1`,
      [t.sindico.email]
    )
    await sql.unsafe(
      `INSERT INTO ${t.schemaName}.vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo, ativo, principal)
       VALUES ($1, $2, $3, 'proprietario', true, true)`,
      [uuidv4(), t.morador.pessoaId, t.unidadeId]
    )
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
    tokenSuper = await login(`root-${t.sindico.email}`, t.sindico.senha)
  })

  afterAll(async () => {
    await sql.unsafe(`DELETE FROM faturas WHERE tenant_id = $1`, [t.tenantId])
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  // ---------- CHAT ----------
  it('morador e portaria trocam mensagens na conversa da unidade', async () => {
    const m1 = await app.inject({
      method: 'POST',
      url: `/chat/${t.unidadeId}/mensagens`,
      headers: auth(tokenMorador),
      payload: { texto: 'Oi portaria, meu interfone quebrou.' },
    })
    expect(m1.statusCode).toBe(201)
    expect(m1.json().data.origem).toBe('morador')

    const m2 = await app.inject({
      method: 'POST',
      url: `/chat/${t.unidadeId}/mensagens`,
      headers: auth(tokenPorteiro),
      payload: { texto: 'Entendido, vamos avisar quando chegar visita.' },
    })
    expect(m2.statusCode).toBe(201)
    expect(m2.json().data.origem).toBe('portaria')

    const thread = await app.inject({
      method: 'GET',
      url: `/chat/${t.unidadeId}/mensagens`,
      headers: auth(tokenMorador),
    })
    expect(thread.json().data.length).toBe(2)

    const conversas = await app.inject({ method: 'GET', url: '/chat/conversas', headers: auth(tokenPorteiro) })
    const c = conversas.json().data.find((x: any) => x.unidade_id === t.unidadeId)
    expect(c.ultima_mensagem).toContain('avisar')
  })

  it('morador não acessa conversa de unidade alheia', async () => {
    const outraUnidade = uuidv4()
    await sql.unsafe(
      `INSERT INTO ${t.schemaName}.unidades (id, bloco_id, numero) VALUES ($1, $2, '999')`,
      [outraUnidade, t.blocoId]
    )
    const res = await app.inject({
      method: 'GET',
      url: `/chat/${outraUnidade}/mensagens`,
      headers: auth(tokenMorador),
    })
    expect(res.statusCode).toBe(403)
  })

  // ---------- BILLING ----------
  it('gera fatura do plano via Cora (stub) ligada à licença', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/admin/faturas',
      headers: auth(tokenSuper),
      payload: { tenant_id: t.tenantId, competencia: '2026-07' },
    })
    expect(res.statusCode).toBe(201)
    const f = res.json().data
    faturaId = f.id
    coraInvoiceId = f.cora_invoice_id
    expect(f.status).toBe('aberta')
    expect(f.linha_digitavel).toBeTruthy()
    expect(f.pix_copia_cola).toBeTruthy()
    expect(f.stub).toBe(true)

    const dup = await app.inject({
      method: 'POST',
      url: '/admin/faturas',
      headers: auth(tokenSuper),
      payload: { tenant_id: t.tenantId, competencia: '2026-07' },
    })
    expect(dup.statusCode).toBe(409)
  })

  it('webhook da Cora liquida a fatura e estende a licença em 1 mês', async () => {
    const [antes] = await sql.unsafe(`SELECT validade FROM licencas WHERE tenant_id = $1`, [t.tenantId])

    const semSegredo = await app.inject({
      method: 'POST',
      url: '/webhooks/cora',
      payload: { event: 'invoice.paid', invoice_id: coraInvoiceId },
    })
    expect(semSegredo.statusCode).toBe(401)

    const ok = await app.inject({
      method: 'POST',
      url: '/webhooks/cora',
      headers: { 'x-webhook-secret': 'segredo-teste' },
      payload: { event: 'invoice.paid', invoice_id: coraInvoiceId },
    })
    expect(ok.statusCode).toBe(200)
    expect(ok.json().data.paga).toBe(true)

    const [fatura] = await sql.unsafe(`SELECT * FROM faturas WHERE id = $1`, [faturaId])
    expect(fatura.status).toBe('paga')
    expect(fatura.metodo_pagamento).toBe('cora')

    const [depois] = await sql.unsafe(`SELECT validade FROM licencas WHERE tenant_id = $1`, [t.tenantId])
    expect(new Date(depois.validade).getTime()).toBeGreaterThan(new Date(antes.validade).getTime())
  })

  it('baixa manual liquida fatura aberta e registra quem deu baixa', async () => {
    const criar = await app.inject({
      method: 'POST',
      url: '/admin/faturas',
      headers: auth(tokenSuper),
      payload: { tenant_id: t.tenantId, competencia: '2026-08', valor_centavos: 12345 },
    })
    const f2 = criar.json().data
    expect(f2.valor_centavos).toBe(12345)

    const baixa = await app.inject({
      method: 'POST',
      url: `/admin/faturas/${f2.id}/baixa-manual`,
      headers: auth(tokenSuper),
    })
    expect(baixa.statusCode).toBe(200)
    expect(baixa.json().data.metodo_pagamento).toBe('manual')
    expect(baixa.json().data.baixa_manual_por).toBeTruthy()

    // pagamento reativa a licença e estende a validade
    const [lic] = await sql.unsafe(
      `SELECT ativa, validade FROM public.licencas WHERE tenant_id = $1`,
      [t.tenantId]
    )
    expect(lic.ativa).toBe(true)
    expect(new Date(lic.validade).getTime()).toBeGreaterThan(Date.now())

    const dupla = await app.inject({
      method: 'POST',
      url: `/admin/faturas/${f2.id}/baixa-manual`,
      headers: auth(tokenSuper),
    })
    expect(dupla.statusCode).toBe(409)
  })

  it('billing é exclusivo do superadmin', async () => {
    const res = await app.inject({ method: 'GET', url: '/admin/faturas', headers: auth(tokenMorador) })
    expect(res.statusCode).toBe(403)
  })
})
