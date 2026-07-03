import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import type { FastifyInstance } from 'fastify'
import * as XLSX from 'xlsx'
import { buildApp } from '../src/app.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'
import { parseTabela } from '../src/services/tabelaImportService.js'

const CSV = [
  'Unidade;Nome;Tipo;CPF/CNPJ;Email;Telefone',
  '301;Carlos Silva;Proprietário;52998224725;carlos@ex.com;75999990000',
  '301;Marta Silva;Residente;;marta@ex.com;',
  '302;Imobiliária Alfa LTDA;Proprietário;12345678000195;contato@alfa.com;7530300000',
].join('\n')

describe('importação tabular (CSV/XLSX)', () => {
  let app: FastifyInstance
  const sql = makeSql()
  let t: TestTenant
  let token: string

  beforeAll(async () => {
    t = await createTestTenant(sql, 'imptab')
    app = await buildApp()
    await app.ready()
    token = (
      await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: t.sindico.email, senha: t.sindico.senha, tenant_id: t.tenantId },
      })
    ).json().data.token
  })

  afterAll(async () => {
    await app.close()
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('parseTabela lê CSV com cabeçalhos flexíveis e agrupa por unidade', () => {
    const rel = parseTabela(Buffer.from(CSV, 'utf-8'), 'moradores.csv')
    expect(rel.unidades.length).toBe(2)
    const u301 = rel.unidades.find((u) => u.codigo === '301')!
    expect(u301.ocupantes.length).toBe(2)
    expect(u301.ocupantes[0].cpf).toBe('52998224725')
    const u302 = rel.unidades.find((u) => u.codigo === '302')!
    expect(u302.ocupantes[0].cpf).toBe('12345678000195')
  })

  it('parseTabela rejeita planilha sem colunas obrigatórias', () => {
    expect(() => parseTabela(Buffer.from('foo;bar\n1;2', 'utf-8'), 'x.csv')).toThrow(/unidade/)
  })

  const importar = (buffer: Buffer, filename: string, contentType: string, dryRun: boolean) => {
    const boundary = '----vitestboundary'
    const payload = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${contentType}\r\n\r\n`
      ),
      buffer,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ])
    return app.inject({
      method: 'POST',
      url: `/unidades/importar?dry_run=${dryRun}&bloco=Bloco A`,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': `multipart/form-data; boundary=${boundary}`,
      },
      payload,
    })
  }

  it('dry-run de CSV retorna o plano sem gravar', async () => {
    const res = await importar(Buffer.from(CSV, 'utf-8'), 'moradores.csv', 'text/csv', true)
    expect(res.statusCode).toBe(200)
    const data = res.json().data
    expect(data.dry_run).toBe(true)
    expect(data.totais.unidades).toBe(2)
    expect(data.totais.juridicas).toBe(1)
    const antes = await sql.unsafe(`SELECT * FROM ${t.schemaName}.unidades WHERE numero = '301'`)
    expect(antes.length).toBe(0)
  })

  it('aplica XLSX criando unidades, pessoas e vínculos (jurídica com CNPJ)', async () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Unidade', 'Nome', 'Vínculo', 'Documento', 'Email'],
      ['301', 'Carlos Silva', 'Proprietário', '52998224725', 'carlos@ex.com'],
      ['302', 'Imobiliária Alfa LTDA', 'Proprietário', '12.345.678/0001-95', 'contato@alfa.com'],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Moradores')
    const xbuf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer

    const res = await importar(
      xbuf,
      'moradores.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      false
    )
    expect(res.statusCode).toBe(201)
    expect(res.json().data.resultado.unidades_criadas).toBe(2)

    const juridica = await sql.unsafe(
      `SELECT * FROM ${t.schemaName}.pessoas WHERE nome = 'Imobiliária Alfa LTDA'`
    )
    expect(juridica[0].tipo_pessoa).toBe('juridica')

    // idempotente: reimportar não duplica
    const again = await importar(
      xbuf,
      'moradores.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      false
    )
    expect(again.json().data.resultado.unidades_criadas).toBe(0)
    expect(again.json().data.resultado.pessoas_criadas).toBe(0)
  })
})
