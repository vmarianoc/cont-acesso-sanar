import client from './client'

export interface Resumo {
  nome: string
  unidade: string | null
  bloco: string | null
  condominio: string | null
  encomendas_aguardando: number
  visitantes_aguardando: number
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
}

export interface Espaco {
  id: string
  nome: string
  descricao: string | null
  periodos: { nome: string; inicio: string; fim: string }[]
  exige_aprovacao: boolean
}

export interface Reserva {
  id: string
  espaco_id: string
  espaco_nome: string
  data: string
  periodo: string | null
  status: 'pendente' | 'confirmada' | 'cancelada'
}

export interface Solicitacao {
  id: string
  nome: string
  documento: string | null
  tipo: string
  status: 'pendente' | 'liberado' | 'recusado'
  criado_em: string
}

const get = <T>(url: string) => client.get(url).then((r) => r.data.data as T)

export const fetchResumo = () => get<Resumo>('/morador/resumo')
export const fetchEncomendas = () => get<Encomenda[]>('/morador/encomendas')
export const fetchEspacos = () => get<Espaco[]>('/espacos')
export const fetchReservas = () => get<Reserva[]>('/morador/reservas')
export const fetchSolicitacoes = () => get<Solicitacao[]>('/morador/solicitacoes')

export const criarReserva = (espaco_id: string, data: string, periodo?: string) =>
  client.post('/morador/reservas', { espaco_id, data, periodo }).then((r) => r.data.data as Reserva)

export const decidirSolicitacao = (id: string, status: 'liberado' | 'recusado') =>
  client.patch(`/morador/solicitacoes/${id}`, { status }).then((r) => r.data.data as Solicitacao)

export interface Comunicado {
  id: string
  titulo: string
  corpo: string
  prioridade: 'normal' | 'urgente'
  criado_em: string
  lido: boolean
}

export interface DocumentoResumo {
  id: string
  titulo: string
  arquivo_nome: string
  tamanho: number
  escopo: 'todos' | 'grupo'
  grupo_nome: string | null
  criado_em: string
}

export const fetchComunicados = () => get<Comunicado[]>('/comunicados')
export const confirmarLeitura = (id: string) =>
  client.post(`/comunicados/${id}/lida`).then((r) => r.data.data)
export const fetchDocumentos = () => get<DocumentoResumo[]>('/documentos')
export const baixarDocumento = (id: string) =>
  client.get(`/documentos/${id}/download`, { responseType: 'blob' }).then((r) => r.data as Blob)

export const cancelarReserva = (id: string) =>
  client.delete(`/morador/reservas/${id}`).then((r) => r.data.data as Reserva)

export interface ContextoUnidade {
  unidade_id: string
  unidade_numero: string
  bloco: string
  condominio: string
  principal: boolean
}

export interface ContaCondominio {
  tenant_id: string
  condominio: string
}

export const fetchContextos = () => get<ContextoUnidade[]>('/morador/contextos')

export const trocarCondominio = (tenant_id: string) =>
  client.post('/auth/trocar-condominio', { tenant_id }).then((r) => r.data.data as { token: string; tenant_id: string; condominio: string })
