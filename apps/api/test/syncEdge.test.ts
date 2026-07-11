import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

describe('circuito cadastro/foto → sync_queue → Edge (BioT)', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let tokenSindico: string
  let facialId: string

  const comandos = async (tipo?: string) => {
    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    const rows = await sql.unsafe(
      `SELECT tipo_comando, payload, jsonb_typeof(payload) AS typ FROM sync_queue WHERE dispositivo_id = $1 ${tipo ? `AND tipo_comando = '${tipo}'` : ''} ORDER BY criado_em`,
      [facialId]
    )
    return rows.map((r: any) => ({
      ...r,
      payload: typeof r.payload === 'string' ? JSON.parse(r.payload) : r.payload,
    }))
  }

  beforeAll(async () => {
    t = await createTestTenant(sql, 'syncedge')
    app = await buildApp()
    await app.ready()
    tokenSindico = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: t.sindico.email, senha: t.sindico.senha, tenant_id: t.tenantId },
      })
    ).json().data.token

    facialId = uuidv4()
    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    await sql.unsafe(
      `INSERT INTO dispositivos (id, nome, tipo, condominio_id, area)
       VALUES ($1, 'Facial Sync', 'leitor_facial', $2, 'portaria')`,
      [facialId, t.condominioId]
    )
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('criar pessoa enfileira pessoa.criar com nome no payload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/pessoas',
      headers: { authorization: `Bearer ${tokenSindico}` },
      payload: { nome: 'Novo Morador Sync', tipo: 'morador' },
    })
    expect(res.statusCode).toBe(201)
    const rows = await comandos('pessoa.criar')
    expect(rows.length).toBe(1)
    expect(rows[0].typ).toBe('object') // jsonb de verdade, não string dupla
    expect(rows[0].payload.nome).toBe('Novo Morador Sync')
    expect(rows[0].payload.pessoa_id).toBe(res.json().data.id)
  })

  it('upload de foto salva biometria e enfileira face.atualizar com foto_base64', async () => {
    const [pessoa] = await sql.unsafe(`SELECT id FROM pessoas WHERE nome = 'Novo Morador Sync'`)
    const boundary = '----teste'
    const foto = Buffer.from('jpegfake-conteudo-da-foto')
    const corpo = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="foto"; filename="rosto.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
      foto,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    const res = await app.inject({
      method: 'POST',
      url: `/pessoas/${pessoa.id}/foto`,
      headers: {
        authorization: `Bearer ${tokenSindico}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload: corpo,
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().data.dispositivos_sincronizados).toBe(1)

    const rows = await comandos('face.atualizar')
    expect(rows.length).toBe(1)
    expect(Buffer.from(rows[0].payload.foto_base64, 'base64').toString()).toBe('jpegfake-conteudo-da-foto')

    // foto pode ser lida de volta (tela do admin)
    const download = await app.inject({
      method: 'GET',
      url: `/pessoas/${pessoa.id}/foto`,
      headers: { authorization: `Bearer ${tokenSindico}` },
    })
    expect(download.statusCode).toBe(200)
    expect(download.rawPayload.toString()).toBe('jpegfake-conteudo-da-foto')
  })

  it('desativar pessoa enfileira pessoa.remover', async () => {
    const [pessoa] = await sql.unsafe(`SELECT id FROM pessoas WHERE nome = 'Novo Morador Sync'`)
    const res = await app.inject({
      method: 'PATCH',
      url: `/pessoas/${pessoa.id}`,
      headers: { authorization: `Bearer ${tokenSindico}` },
      payload: { ativo: false },
    })
    expect(res.statusCode).toBe(200)
    const rows = await comandos('pessoa.remover')
    expect(rows.length).toBe(1)
  })

  it('aprovação de cadastro de pessoa enfileira pessoa.atualizar', async () => {
    await sql.unsafe(`SET search_path TO ${t.schemaName}, public`)
    const aprovacaoId = uuidv4()
    await sql.unsafe(
      `INSERT INTO aprovacoes (id, pessoa_id, unidade_id, tipo, dados)
       VALUES ($1, $2, $3, 'atualizacao_pessoa', '{}')`,
      [aprovacaoId, t.morador.pessoaId, t.unidadeId]
    )
    const res = await app.inject({
      method: 'PATCH',
      url: `/aprovacoes/${aprovacaoId}`,
      headers: { authorization: `Bearer ${tokenSindico}` },
      payload: { status: 'aprovado' },
    })
    expect(res.statusCode).toBe(200)
    const rows = await comandos('pessoa.atualizar')
    expect(rows.length).toBe(1)
    expect(rows[0].payload.aprovacao_id).toBe(aprovacaoId)
    expect(rows[0].payload.nome).toBe(t.moradorNome)
  })

  it('comandos usam apenas o vocabulário que o Edge entende', async () => {
    const rows = await comandos()
    const validos = new Set(['pessoa.criar', 'pessoa.atualizar', 'pessoa.remover', 'face.atualizar'])
    for (const r of rows) expect(validos.has(r.tipo_comando)).toBe(true)
  })
})
