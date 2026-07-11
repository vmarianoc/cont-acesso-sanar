import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'
import { hashPassword } from '../src/services/authService.js'

describe('multi-unidade e multi-condomínio', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t1: TestTenant
  let t2: TestTenant
  let tokenT1: string
  let unidade2Id: string

  const EMAIL_COMPARTILHADO = () => t1.morador.email

  beforeAll(async () => {
    t1 = await createTestTenant(sql, 'multi1')
    t2 = await createTestTenant(sql, 'multi2')
    app = await buildApp()
    await app.ready()

    // mesmo e-mail do morador do tenant 1 também existe no tenant 2
    const senhaHash = await hashPassword('senha123')
    const pessoaT2 = uuidv4()
    await sql.unsafe(
      `INSERT INTO ${t2.schemaName}.pessoas (id, nome, tipo) VALUES ($1, 'Morador Espelho', 'morador')`,
      [pessoaT2]
    )
    await sql.unsafe(
      `INSERT INTO ${t2.schemaName}.usuarios_tenant (id, pessoa_id, email, senha_hash, perfil)
       VALUES ($1, $2, $3, $4, 'morador')`,
      [uuidv4(), pessoaT2, t1.morador.email, senhaHash]
    )

    // multi-unidade no tenant 1: vínculo na 101 (principal) e numa 902 nova
    unidade2Id = uuidv4()
    await sql.unsafe(
      `INSERT INTO ${t1.schemaName}.unidades (id, bloco_id, numero, andar) VALUES ($1, $2, '902', 9)`,
      [unidade2Id, t1.blocoId]
    )
    await sql.unsafe(
      `INSERT INTO ${t1.schemaName}.vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo, ativo, principal)
       VALUES ($1, $2, $3, 'proprietario', true, true), ($4, $2, $5, 'proprietario', true, false)`,
      [uuidv4(), t1.morador.pessoaId, t1.unidadeId, uuidv4(), unidade2Id]
    )

    tokenT1 = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: t1.morador.email, senha: 'senha123', tenant_id: t1.tenantId },
      })
    ).json().data.token
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t1)
    await dropTestTenant(sql, t2)
    await sql.end()
  })

  it('lista os contextos (unidades) do morador', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/morador/contextos',
      headers: { authorization: `Bearer ${tokenT1}` },
    })
    expect(res.statusCode).toBe(200)
    const numeros = res.json().data.map((c: any) => c.unidade_numero)
    expect(numeros).toContain('101')
    expect(numeros).toContain('902')
  })

  it('x-unidade-id troca o contexto do resumo; unidade alheia é rejeitada', async () => {
    const na902 = await app.inject({
      method: 'GET',
      url: '/morador/resumo',
      headers: { authorization: `Bearer ${tokenT1}`, 'x-unidade-id': unidade2Id },
    })
    expect(na902.json().data.unidade).toBe('902')

    const padrao = await app.inject({
      method: 'GET',
      url: '/morador/resumo',
      headers: { authorization: `Bearer ${tokenT1}` },
    })
    expect(padrao.json().data.unidade).toBe('101') // principal

    const alheia = await app.inject({
      method: 'GET',
      url: '/morador/resumo',
      headers: { authorization: `Bearer ${tokenT1}`, 'x-unidade-id': uuidv4() },
    })
    expect(alheia.statusCode).toBe(404)
  })

  it('POST /auth/contas lista os dois condomínios do mesmo e-mail', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/auth/contas',
      payload: { email: EMAIL_COMPARTILHADO(), senha: 'senha123' },
    })
    expect(res.statusCode).toBe(200)
    const ids = res.json().data.map((c: any) => c.tenant_id)
    expect(ids).toContain(t1.tenantId)
    expect(ids).toContain(t2.tenantId)

    const errada = await app.inject({
      method: 'POST',
      url: '/auth/contas',
      payload: { email: EMAIL_COMPARTILHADO(), senha: 'senhaErrada' },
    })
    expect(errada.json().data.length).toBe(0)
  })

  it('trocar-condominio emite token válido no outro tenant', async () => {
    const troca = await app.inject({
      method: 'POST',
      url: '/auth/trocar-condominio',
      headers: { authorization: `Bearer ${tokenT1}` },
      payload: { tenant_id: t2.tenantId },
    })
    expect(troca.statusCode).toBe(200)
    const novoToken = troca.json().data.token

    const resumo = await app.inject({
      method: 'GET',
      url: '/morador/resumo',
      headers: { authorization: `Bearer ${novoToken}` },
    })
    expect(resumo.json().data.nome).toBe('Morador Espelho')

    // tenant sem conta do e-mail → 403
    const semConta = await app.inject({
      method: 'POST',
      url: '/auth/trocar-condominio',
      headers: { authorization: `Bearer ${(
        await app.inject({
          method: 'POST',
          url: '/auth/login',
          payload: { email: t2.sindico.email, senha: 'senha123', tenant_id: t2.tenantId },
        })
      ).json().data.token}` },
      payload: { tenant_id: t1.tenantId },
    })
    expect(semConta.statusCode).toBe(403)
  })
})
