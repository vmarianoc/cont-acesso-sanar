import client from './client'

export interface Pessoa {
  id: string
  nome: string
  cpf: string | null
  tipo: string
  tipo_pessoa?: 'fisica' | 'juridica'
  email?: string | null
  telefone?: string | null
}

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

export interface Liberacao {
  id: string
  area: string
  metodo: string
  valido_de: string
  valido_ate: string
  origem_tipo: 'reserva' | 'visitante' | 'manual'
  pessoa_nome: string | null
  visitante_nome: string | null
}

export interface Licenca {
  plano: string
  uso: { unidades: number; dispositivos: number }
}

const get = <T>(url: string) => client.get(url).then((r) => r.data.data as T)

export const fetchPessoas = (busca?: string) =>
  get<Pessoa[]>(`/pessoas?limit=100${busca ? `&busca=${encodeURIComponent(busca)}` : ''}`)

export const criarPessoa = (payload: { nome: string; cpf?: string; tipo: string }) =>
  client.post('/pessoas', payload).then((r) => r.data.data as Pessoa)

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

export const fetchLiberacoes = (vigentes = false) =>
  get<Liberacao[]>(`/liberacoes${vigentes ? '?vigentes=true' : ''}`)

export const criarLiberacao = (payload: {
  pessoa_id: string
  area: string
  valido_de: string
  valido_ate: string
}) => client.post('/liberacoes', payload).then((r) => r.data.data as Liberacao)

export const revogarLiberacao = (id: string) =>
  client.delete(`/liberacoes/${id}`).then((r) => r.data.data)

export const fetchLicenca = () => get<Licenca>('/licenca')

export interface Dispositivo {
  id: string
  nome: string
  tipo: string
  area: string
  local: string | null
  ativo: boolean
  condominio_nome: string | null
}

export const fetchDispositivos = () => get<Dispositivo[]>('/dispositivos')

export const criarDispositivo = (payload: { nome: string; tipo: string; area: string; local?: string }) =>
  client.post('/dispositivos', payload).then((r) => r.data.data as Dispositivo)

export const atualizarDispositivo = (id: string, payload: { ativo?: boolean; area?: string; nome?: string }) =>
  client.patch(`/dispositivos/${id}`, payload).then((r) => r.data.data as Dispositivo)
