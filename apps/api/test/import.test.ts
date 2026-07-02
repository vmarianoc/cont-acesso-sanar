import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  mapRelatorioParaPlano,
  aplicarImportacao,
  mapTipoVinculo,
  type RelatorioParseado,
} from '../src/services/pdfImportService.js'
import { makeSql, createTestTenant, dropTestTenant, type TestTenant } from './helpers.js'

const relatorio: RelatorioParseado = {
  condominioNome: 'Cond Teste',
  unidades: [
    {
      codigo: '101 01',
      fracao: '0,1',
      ocupantes: [
        { tipo: 'Proprietário', nome: 'MRV não entregou as chaves- Ana Dona', telefone: '(75) 1', cpf: '111.111.111-11', email: 'ana@x.com', endereco: '' },
        { tipo: 'Residente', nome: 'Beto Mora', telefone: '', cpf: '', email: '', endereco: '' },
      ],
    },
    {
      codigo: '000',
      fracao: '0',
      ocupantes: [
        { tipo: 'Proprietário', nome: 'Empresa X LTDA', telefone: '', cpf: '11.222.333/0001-44', email: 'e@x.com', endereco: '' },
      ],
    },
  ],
}

describe('mapTipoVinculo', () => {
  it('maps report roles to vínculo types', () => {
    expect(mapTipoVinculo('Proprietário')).toEqual({ tipo: 'proprietario', principal: true })
    expect(mapTipoVinculo('Residente')).toEqual({ tipo: 'inquilino', principal: false })
    expect(mapTipoVinculo('Dependente')).toEqual({ tipo: 'dependente', principal: false })
    expect(mapTipoVinculo('Procurador')).toEqual({ tipo: 'dependente', principal: false })
  })
})

describe('mapRelatorioParaPlano', () => {
  it('cleans names, derives andar and enforces a single principal', () => {
    const plano = mapRelatorioParaPlano(relatorio)
    expect(plano.condominioNome).toBe('Cond Teste')
    expect(plano.totais.unidades).toBe(2)
    expect(plano.totais.ocupantes).toBe(3)

    const u101 = plano.unidades.find((u) => u.numero === '101 01')!
    expect(u101.andar).toBe(1)
    expect(u101.ocupantes[0].nome).toBe('Ana Dona') // prefixo de nota removido
    expect(u101.ocupantes[0].cpf).toBe('11111111111') // só dígitos
    expect(u101.ocupantes[0].tipo_pessoa).toBe('fisica')
    expect(u101.ocupantes.filter((o) => o.principal).length).toBe(1)
    expect(u101.ocupantes.find((o) => o.nome === 'Beto Mora')!.tipo_vinculo).toBe('inquilino')

    const u000 = plano.unidades.find((u) => u.numero === '000')!
    expect(u000.andar).toBeNull()
    expect(u000.ocupantes[0].cpf).toBe('11222333000144') // CNPJ preservado
    expect(u000.ocupantes[0].tipo_pessoa).toBe('juridica') // dono é pessoa jurídica

    expect(plano.totais.juridicas).toBe(1)
    expect(plano.totais.comDocumento).toBe(2) // Ana (CPF) + Empresa (CNPJ); Beto sem documento
  })
})

describe('aplicarImportacao', () => {
  const sql = makeSql()
  let t: TestTenant

  beforeAll(async () => {
    t = await createTestTenant(sql, 'import')
  })
  afterAll(async () => {
    await dropTestTenant(sql, t)
    await sql.end()
  })

  it('imports units/people/vínculos transactionally and is idempotent', async () => {
    const plano = mapRelatorioParaPlano(relatorio)
    const reserved = await sql.reserve()
    try {
      await reserved.unsafe(`SET search_path TO ${t.schemaName}, public`)

      const r1 = await aplicarImportacao(reserved, plano, { usuarioId: t.sindico.pessoaId })
      expect(r1.unidades_criadas).toBe(2)
      expect(r1.pessoas_criadas).toBe(3)
      expect(r1.vinculos_criados).toBe(3)

      const r2 = await aplicarImportacao(reserved, plano, { usuarioId: t.sindico.pessoaId })
      expect(r2.unidades_criadas).toBe(0)
      expect(r2.pessoas_criadas).toBe(0)
      expect(r2.vinculos_criados).toBe(0)
      expect(r2.unidades_existentes).toBe(2)

      const principais = await reserved.unsafe<{ c: string }[]>(
        `SELECT count(*) AS c FROM vinculos_unidade v
         JOIN unidades u ON u.id = v.unidade_id
         JOIN blocos b ON b.id = u.bloco_id
         WHERE b.nome = 'Bloco Principal' AND v.principal = true AND v.ativo = true`
      )
      expect(Number(principais[0].c)).toBe(2)

      const pj = await reserved.unsafe<{ tipo_pessoa: string }[]>(
        `SELECT tipo_pessoa FROM pessoas WHERE cpf = '11222333000144' LIMIT 1`
      )
      expect(pj[0]?.tipo_pessoa).toBe('juridica')

      const audit = await reserved.unsafe<{ c: string }[]>(
        `SELECT count(*) AS c FROM auditoria WHERE acao = 'IMPORT'`
      )
      expect(Number(audit[0].c)).toBeGreaterThanOrEqual(2)
    } finally {
      await reserved.unsafe('SET search_path TO public')
      reserved.release()
    }
  })
})
