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

export interface Usuario {
  id: string
  email: string
  perfil: 'sindico' | 'porteiro' | 'morador' | 'admin' | 'superadmin'
  ativo: boolean
  mfa_ativo: boolean
  pessoa_id: string | null
  pessoa_nome: string | null
  criado_em: string
}

export interface PessoaResumo {
  id: string
  nome: string
  tipo: string
}

export interface CreateUsuario {
  email: string
  senha: string
  perfil: 'sindico' | 'porteiro' | 'morador' | 'admin'
  pessoa_id?: string
}

export interface Unidade {
  id: string
  numero: string
  andar: number | null
  ativa: boolean
  bloco: { id: string; nome: string }
  condominio: { id: string; nome: string }
}

export interface Ocupante {
  id: string
  pessoa_id: string
  tipo_vinculo: 'proprietario' | 'inquilino' | 'dependente' | 'funcionario'
  principal: boolean
  pessoa_nome: string
}

export interface CreateOcupante {
  pessoa_id: string
  tipo_vinculo: Ocupante['tipo_vinculo']
  principal: boolean
}

const get = <T>(url: string) => client.get(url).then((r) => r.data.data as T)

export const fetchAprovacoes = (status?: string) =>
  get<Aprovacao[]>(`/aprovacoes${status ? `?status=${status}` : ''}`)

export const fetchLicenca = () => get<Licenca>('/licenca')

export const decidirAprovacao = (id: string, status: 'aprovado' | 'rejeitado', observacao?: string) =>
  client.patch(`/aprovacoes/${id}`, { status, observacao }).then((r) => r.data.data as Aprovacao)

export const fetchUsuarios = () => get<Usuario[]>('/usuarios')

export const fetchPessoasSemUsuario = (busca?: string) =>
  get<PessoaResumo[]>(`/pessoas?sem_usuario=true&limit=100${busca ? `&busca=${encodeURIComponent(busca)}` : ''}`)

export const criarUsuario = (payload: CreateUsuario) =>
  client.post('/usuarios', payload).then((r) => r.data.data as Usuario)

export const atualizarUsuario = (id: string, payload: { perfil?: string; ativo?: boolean }) =>
  client.patch(`/usuarios/${id}`, payload).then((r) => r.data.data as Usuario)

export const fetchUnidades = (busca?: string) =>
  get<Unidade[]>(`/unidades${busca ? `?busca=${encodeURIComponent(busca)}` : ''}`)

export const fetchOcupantes = (unidadeId: string) =>
  get<Ocupante[]>(`/unidades/${unidadeId}/ocupantes`)

export const adicionarOcupante = (unidadeId: string, payload: CreateOcupante) =>
  client.post(`/unidades/${unidadeId}/ocupantes`, payload).then((r) => r.data.data as Ocupante)

export const removerOcupante = (unidadeId: string, vinculoId: string) =>
  client.delete(`/unidades/${unidadeId}/ocupantes/${vinculoId}`)

export const fetchPessoas = (busca?: string) =>
  get<PessoaResumo[]>(`/pessoas?limit=100${busca ? `&busca=${encodeURIComponent(busca)}` : ''}`)

export interface Comunicado {
  id: string
  titulo: string
  corpo: string
  prioridade: 'normal' | 'urgente'
  criado_em: string
  leituras: number
  lido: boolean
}

export interface Grupo {
  id: string
  nome: string
  descricao: string | null
  membros: { pessoa_id: string; nome: string }[]
}

export interface Documento {
  id: string
  titulo: string
  descricao: string | null
  arquivo_nome: string
  mime: string
  tamanho: number
  escopo: 'todos' | 'grupo'
  grupo_id: string | null
  grupo_nome: string | null
  criado_em: string
}

export const fetchComunicados = () => get<Comunicado[]>('/comunicados')
export const publicarComunicado = (payload: { titulo: string; corpo: string; prioridade: string }) =>
  client.post('/comunicados', payload).then((r) => r.data.data as Comunicado)
export const removerComunicado = (id: string) =>
  client.delete(`/comunicados/${id}`).then((r) => r.data.data)

export const fetchGrupos = () => get<Grupo[]>('/grupos')
export const criarGrupo = (nome: string, descricao?: string) =>
  client.post('/grupos', { nome, descricao }).then((r) => r.data.data as Grupo)
export const adicionarMembro = (grupoId: string, pessoa_id: string) =>
  client.post(`/grupos/${grupoId}/membros`, { pessoa_id }).then((r) => r.data.data)
export const removerMembro = (grupoId: string, pessoaId: string) =>
  client.delete(`/grupos/${grupoId}/membros/${pessoaId}`).then((r) => r.data.data)

export const fetchDocumentos = () => get<Documento[]>('/documentos')
export const publicarDocumento = (form: FormData) =>
  client.post('/documentos', form, { headers: { 'Content-Type': 'multipart/form-data' } })
    .then((r) => r.data.data as Documento)
export const removerDocumento = (id: string) =>
  client.delete(`/documentos/${id}`).then((r) => r.data.data)
