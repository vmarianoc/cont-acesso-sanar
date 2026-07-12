import client from './client'

export interface Unidade {
  id: string
  numero: string
  bloco: { nome: string }
}

export interface Encomenda {
  id: string
  remetente: string
  descricao: string | null
  prateleira: string | null
  codigo_retirada: string | null
  status: 'aguardando' | 'retirada'
  recebida_em: string
  retirada_em: string | null
  pessoa_nome: string | null
  unidade_numero: string | null
}

const get = <T>(url: string) => client.get(url).then((r) => r.data.data as T)

export const fetchUnidades = (busca?: string) =>
  get<Unidade[]>(`/unidades?limit=500${busca ? `&busca=${encodeURIComponent(busca)}` : ''}`)

export const fetchEncomendas = (status?: string) =>
  get<Encomenda[]>(`/encomendas${status ? `?status=${status}` : ''}`)

export const registrarEncomenda = (payload: {
  unidade_id: string
  remetente: string
  descricao?: string
  prateleira?: string
}) => client.post('/encomendas', payload).then((r) => r.data.data as Encomenda)

export const retirarEncomenda = (id: string, codigo_retirada: string) =>
  client.patch(`/encomendas/${id}/retirar`, { codigo_retirada }).then((r) => r.data.data as Encomenda)
