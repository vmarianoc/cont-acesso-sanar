import { useEffect, useRef } from 'react'
import { apiBase } from './client'

export interface EventoRealtime {
  tipo: string
  dados?: Record<string, unknown>
  em?: string
}

/**
 * Conecta ao stream SSE da API (/rt/stream) com o token da sessão e chama
 * onEvento a cada mensagem. Reconecta sozinho (comportamento nativo do
 * EventSource) e refaz a conexão quando o token muda.
 */
export function useRealtime(onEvento: (evento: EventoRealtime) => void) {
  const handler = useRef(onEvento)
  handler.current = onEvento

  useEffect(() => {
    const token = localStorage.getItem('token')
    if (!token) return

    const base = apiBase()
    let es: EventSource | null = null
    let cancelado = false

    // Ticket de uso único evita expor o JWT na query string (logs de proxy).
    fetch(`${base}/rt/ticket`, { method: 'POST', headers: { authorization: `Bearer ${token}` } })
      .then((r) => r.json())
      .then(({ data }) => {
        if (cancelado || !data?.ticket) return
        es = new EventSource(`${base}/rt/stream?ticket=${encodeURIComponent(data.ticket)}`)
        es.onmessage = (msg) => {
          try {
            handler.current(JSON.parse(msg.data))
          } catch {
            /* heartbeats/formatos inesperados são ignorados */
          }
        }
      })
      .catch(() => {})

    return () => {
      cancelado = true
      es?.close()
    }
  }, [])
}
