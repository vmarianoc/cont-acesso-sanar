import client from './client'

export interface Aprovacao {
  id: string
  pessoa_nome: string | null
  unidade_numero: string | null
  tipo: string
  status: 'pendente' | 'aprovado' | 'rejeitado'
  dados: Record<string, unknown>
  criado_em: string
}

export interface Licenca {
  plano: string
  ativa: boolean
  validade: string | null
  expirada: boolean
  limites: { unidades: number | null; dispositivos: number | null }
  uso: { unidades: number; dispositivos: number }
}

const get = <T>(url: string) => client.get(url).then((r) => r.data.data as T)

export const fetchAprovacoes = (status?: string) =>
  get<Aprovacao[]>(`/aprovacoes${status ? `?status=${status}` : ''}`)

export const fetchLicenca = () => get<Licenca>('/licenca')

export const decidirAprovacao = (id: string, status: 'aprovado' | 'rejeitado', observacao?: string) =>
  client.patch(`/aprovacoes/${id}`, { status, observacao }).then((r) => r.data.data as Aprovacao)
