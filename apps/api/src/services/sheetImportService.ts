import { parse as parseCsvSync } from 'csv-parse/sync'
import * as XLSX from 'xlsx'
import type { RelatorioParseado, UnidadeParseada, OcupanteParseado } from './pdfImportService.js'

const COLUNAS_OBRIGATORIAS = ['unidade', 'nome']

function normalizarChaves(linha: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [chave, valor] of Object.entries(linha)) {
    out[chave.trim().toLowerCase()] = valor === null || valor === undefined ? '' : String(valor).trim()
  }
  return out
}

/** Agrupa linhas planas (uma por ocupante) em um RelatorioParseado, por unidade. */
function linhasParaRelatorio(linhasBrutas: Record<string, unknown>[]): RelatorioParseado {
  const linhas = linhasBrutas.map(normalizarChaves).filter((l) => Object.values(l).some((v) => v !== ''))
  if (linhas.length === 0) {
    throw new Error('Planilha vazia')
  }
  for (const coluna of COLUNAS_OBRIGATORIAS) {
    if (!(coluna in linhas[0])) {
      throw new Error(`Coluna obrigatória "${coluna}" não encontrada`)
    }
  }

  let condominioNome: string | null = null
  const unidades = new Map<string, UnidadeParseada>()

  for (const linha of linhas) {
    const codigo = linha.unidade
    const nome = linha.nome
    if (!codigo || !nome) continue

    if (!condominioNome && linha.condominio) condominioNome = linha.condominio

    if (!unidades.has(codigo)) {
      unidades.set(codigo, { codigo, fracao: linha.fracao ?? '', ocupantes: [] })
    }
    const unidade = unidades.get(codigo)!
    if (!unidade.fracao && linha.fracao) unidade.fracao = linha.fracao

    const ocupante: OcupanteParseado = {
      tipo: linha.tipo ?? '',
      nome,
      telefone: linha.telefone ?? '',
      cpf: linha.cpf ?? '',
      email: linha.email ?? '',
      endereco: '',
    }
    unidade.ocupantes.push(ocupante)
  }

  return { condominioNome, unidades: [...unidades.values()] }
}

/** Extrai o relatório a partir de um CSV (uma linha por ocupante). */
export function parseCsv(buffer: Buffer): RelatorioParseado {
  const registros = parseCsvSync(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  }) as Record<string, unknown>[]
  return linhasParaRelatorio(registros)
}

/** Extrai o relatório a partir da primeira aba de uma planilha Excel (.xlsx/.xls). */
export function parseExcel(buffer: Buffer): RelatorioParseado {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const planilha = workbook.Sheets[workbook.SheetNames[0]]
  const linhas = XLSX.utils.sheet_to_json<Record<string, unknown>>(planilha, { defval: '' })
  return linhasParaRelatorio(linhas)
}
