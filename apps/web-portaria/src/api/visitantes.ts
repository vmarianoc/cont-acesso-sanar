import client from './client'

export interface Visitante {
  id: string
  nome: string
  documento: string | null
  unidade_numero: string | null
  valido_de: string
  valido_ate: string
  entrada_em: string | null
  saida_em: string | null
}

export const fetchVisitantes = () => client.get('/visitantes').then((r) => r.data.data as Visitante[])

export const marcarPresenca = (id: string, acao: 'entrada' | 'saida') =>
  client.post(`/visitantes/${id}/${acao}`)
