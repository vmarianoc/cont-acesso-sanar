import { useQuery } from '@tanstack/react-query'
import { fetchDispositivos } from '../api/dispositivos'

export function useDispositivos() {
  return useQuery({
    queryKey: ['dispositivos'],
    queryFn: fetchDispositivos,
    staleTime: 60000,
  })
}
