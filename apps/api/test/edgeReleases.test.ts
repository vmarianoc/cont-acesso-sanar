import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { createHash } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { versaoMaisNova } from '../src/routes/edgeReleases.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('OTA de releases do Edge', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenSuper: string
  let tokenPorteiro: string
  const VERSAO = `9.9.${Math.floor(Math.random() * 900) + 100}`
  const PACOTE = Buffer.from('tgz-fake-do-edge')

  beforeAll(async () => {
    t = await createTestTenant(sql, 'ota')
    app = await buildApp()
    await app.ready()
    // superadmin de teste: copia a senha do síndico
    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    const [s] = await sql.unsafe(`SELECT senha_hash FROM usuarios_tenant WHERE email = $1`, [t.sindico.email])
    await sql.unsafe(
      `INSERT INTO usuarios_tenant (id, email, senha_hash, perfil) VALUES ($1, $2, $3, 'superadmin')`,
      [uuidv4(), `root-${t.sindico.email}`, s.senha_hash]
    )
    const login = async (email: string, senha: string) =>
      (await app.inject({ method: 'POST', url: '/auth/login', payload: { email, senha, tenant_id: t.tenantId } })).json().data.token
    tokenSuper = await login(`root-${t.sindico.email}`, t.sindico.senha)
    tokenPorteiro = await login(t.porteiro.email, t.porteiro.senha)
  })

  afterAll(async () => {
    await sql.unsafe(`DELETE FROM public.edge_releases WHERE versao = $1`, [VERSAO])
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('compara versões semânticas', () => {
    expect(versaoMaisNova('1.1.0', '1.0.9')).toBe(true)
    expect(versaoMaisNova('1.0.0', '1.0.0')).toBe(false)
    expect(versaoMaisNova('1.0.0', '1.2.0')).toBe(false)
    expect(versaoMaisNova('2.0.0', '1.9.9')).toBe(true)
  })

  it('superadmin publica release e o Edge vê/baixa com sha256 íntegro', async () => {
    const boundary = '----ota'
    const corpo = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="versao"\r\n\r\n${VERSAO}\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="notas"\r\n\r\nteste ota\r\n`),
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="pacote"; filename="edge.tgz"\r\nContent-Type: application/gzip\r\n\r\n`),
      PACOTE,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    const pub = await app.inject({
      method: 'POST',
      url: '/admin/edge/releases',
      headers: { authorization: `Bearer ${tokenSuper}`, 'content-type': `multipart/form-data; boundary=${boundary}` },
      payload: corpo,
    })
    expect(pub.statusCode).toBe(201)
    const shaEsperado = createHash('sha256').update(PACOTE).digest('hex')
    expect(pub.json().data.sha256).toBe(shaEsperado)

    // Edge (qualquer usuário autenticado do tenant) checa e baixa
    const check = await app.inject({
      method: 'GET',
      url: '/edge/update/check?versao=1.0.0',
      headers: { authorization: `Bearer ${tokenPorteiro}` },
    })
    expect(check.json().data.atualizar).toBe(true)
    expect(check.json().data.versao).toBe(VERSAO)

    const naoPrecisa = await app.inject({
      method: 'GET',
      url: `/edge/update/check?versao=${VERSAO}`,
      headers: { authorization: `Bearer ${tokenPorteiro}` },
    })
    expect(naoPrecisa.json().data.atualizar).toBe(false)

    const down = await app.inject({
      method: 'GET',
      url: `/edge/update/download/${VERSAO}`,
      headers: { authorization: `Bearer ${tokenPorteiro}` },
    })
    expect(down.statusCode).toBe(200)
    expect(createHash('sha256').update(down.rawPayload).digest('hex')).toBe(shaEsperado)
  })

  it('publicar exige superadmin; versão duplicada dá 409', async () => {
    const negado = await app.inject({
      method: 'POST',
      url: '/admin/edge/releases',
      headers: { authorization: `Bearer ${tokenPorteiro}`, 'content-type': 'multipart/form-data; boundary=x' },
      payload: '--x--',
    })
    expect(negado.statusCode).toBe(403)
  })
})
