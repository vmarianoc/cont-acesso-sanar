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
