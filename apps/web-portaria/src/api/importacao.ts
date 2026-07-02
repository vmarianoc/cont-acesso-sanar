import client from './client'

export interface OcupantePreview {
  nome: string
  cpf: string | null
  tipo_pessoa: 'fisica' | 'juridica'
  email: string | null
  telefone: string | null
  tipo_vinculo: string
  principal: boolean
}

export interface UnidadePreview {
  numero: string
  andar: number | null
  ocupantes: OcupantePreview[]
}

export interface ImportTotais {
  unidades: number
  ocupantes: number
  comDocumento: number
  juridicas: number
}

export interface ImportPreview {
  dry_run: true
  condominio: string
  bloco: string
  totais: ImportTotais
  amostra: UnidadePreview[]
}

export interface ImportResultado {
  dry_run: false
  condominio: string
  totais: ImportTotais
  resultado: {
    unidades_criadas: number
    unidades_existentes: number
    pessoas_criadas: number
    vinculos_criados: number
  }
}

async function enviar<T>(file: File, dryRun: boolean): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  const res = await client.post(`/unidades/importar?dry_run=${dryRun}`, form, {
    headers: { 'Content-Type': undefined as unknown as string },
    timeout: 120000,
  })
  return res.data.data
}

export const preVisualizarImportacao = (file: File) => enviar<ImportPreview>(file, true)
export const confirmarImportacao = (file: File) => enviar<ImportResultado>(file, false)
