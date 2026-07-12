import { useQuery } from '@tanstack/react-query'
import { fetchEventos } from '../api/eventos'

export function useEventos(limit = 30) {
  return useQuery({
    queryKey: ['eventos', limit],
    queryFn: () => fetchEventos(limit),
    // Caminho rápido é o SSE (ver EventFeed); isso aqui é só rede de
    // segurança caso a conexão em tempo real caia.
    refetchInterval: 20000,
    staleTime: 4000,
  })
}
