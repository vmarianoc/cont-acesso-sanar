import { useQuery } from '@tanstack/react-query'
import { fetchEventos } from '../api/eventos'

export function useEventos(limit = 30) {
  return useQuery({
    queryKey: ['eventos', limit],
    queryFn: () => fetchEventos(limit),
    refetchInterval: 5000,
    staleTime: 4000,
  })
}
