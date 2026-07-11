import * as XLSX from 'xlsx'
import type { RelatorioParseado, UnidadeParseada, OcupanteParseado } from './pdfImportService.js'

/**
 * Importação tabular (CSV / XLSX): converte a planilha para a mesma estrutura
 * do relatório em PDF (RelatorioParseado), reaproveitando mapRelatorioParaPlano
 * e aplicarImportacao.
 *
 * Cabeçalhos reconhecidos (case/acento-insensível): unidade, nome, tipo (ou
 * vínculo), documento (ou cpf/cnpj), email, telefone, endereço, fração.
 */

const normalizar = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '')

const CABECALHOS: Record<string, string[]> = {
  unidade: ['unidade', 'apartamento', 'apto', 'ap', 'numero', 'numunidade'],
  nome: ['nome', 'nomecompleto', 'morador', 'proprietario', 'contato'],
  tipo: ['tipo', 'vinculo', 'tipovinculo', 'relacao'],
  cpf: ['cpf', 'cnpj', 'cpfcnpj', 'documento', 'doc'],
  email: ['email', 'emails'],
  telefone: ['telefone', 'celular', 'fone', 'tel'],
  endereco: ['endereco', 'enderecocobranca'],
  fracao: ['fracao', 'fracaoideal'],
}

function mapearCabecalho(headers: string[]): Record<string, number> {
  const idx: Record<string, number> = {}
  headers.forEach((h, i) => {
    const n = normalizar(String(h ?? ''))
    for (const [campo, aliases] of Object.entries(CABECALHOS)) {
      if (idx[campo] === undefined && aliases.includes(n)) idx[campo] = i
    }
  })
  return idx
}

export function parseTabela(buffer: Buffer, filename: string): RelatorioParseado {
  const wb = XLSX.read(buffer, { type: 'buffer', raw: false })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  if (!sheet) throw new Error('Planilha vazia')
  const linhas = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, blankrows: false })
  if (linhas.length < 2) throw new Error('Planilha sem dados (esperado cabeçalho + linhas)')

  const idx = mapearCabecalho(linhas[0].map(String))
  if (idx.unidade === undefined || idx.nome === undefined) {
    throw new Error('Cabeçalho deve conter ao menos as colunas "unidade" e "nome"')
  }

  const col = (linha: any[], campo: string) =>
    idx[campo] !== undefined ? String(linha[idx[campo]] ?? '').trim() : ''

  const unidades = new Map<string, UnidadeParseada>()
  for (const linha of linhas.slice(1)) {
    const codigo = col(linha, 'unidade')
    const nome = col(linha, 'nome')
    if (!codigo || !nome) continue

    if (!unidades.has(codigo)) {
      unidades.set(codigo, { codigo, fracao: col(linha, 'fracao'), ocupantes: [] })
    }
    const ocupante: OcupanteParseado = {
      tipo: col(linha, 'tipo') || 'Proprietário',
      nome,
      telefone: col(linha, 'telefone'),
      cpf: col(linha, 'cpf').replace(/\D/g, ''),
      email: col(linha, 'email'),
      endereco: col(linha, 'endereco'),
    }
    unidades.get(codigo)!.ocupantes.push(ocupante)
  }

  if (unidades.size === 0) throw new Error('Nenhuma linha válida (unidade + nome) encontrada')

  return {
    condominioNome: filename.replace(/\.(csv|xlsx?|txt)$/i, '') || null,
    unidades: [...unidades.values()],
  }
}

export const isTabular = (filename: string, mimetype?: string) =>
  /\.(csv|xlsx?)$/i.test(filename) ||
  (mimetype ?? '').includes('csv') ||
  (mimetype ?? '').includes('spreadsheet') ||
  (mimetype ?? '').includes('excel')
