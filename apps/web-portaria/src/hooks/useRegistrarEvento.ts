import { useMutation, useQueryClient } from '@tanstack/react-query'
import { registrarEvento } from '../api/eventos'

export function useRegistrarEvento() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: registrarEvento,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eventos'] })
    },
  })
}
