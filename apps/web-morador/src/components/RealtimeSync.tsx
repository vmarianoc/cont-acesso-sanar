import { useQueryClient } from '@tanstack/react-query'
import { useRealtime } from '@condar/ui'

/** Atualiza as queries do app na hora em que a portaria emite eventos. */
export default function RealtimeSync() {
  const qc = useQueryClient()
  useRealtime((ev) => {
    if (ev.tipo === 'solicitacao_acesso') {
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
      qc.invalidateQueries({ queryKey: ['resumo'] })
    }
    if (ev.tipo === 'comunicado_publicado') {
      qc.invalidateQueries({ queryKey: ['comunicados'] })
    }
    if (ev.tipo === 'encomenda_recebida') {
      qc.invalidateQueries({ queryKey: ['encomendas'] })
      qc.invalidateQueries({ queryKey: ['resumo'] })
    }
  })
  return null
}
