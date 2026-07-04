import { useEffect, useRef } from 'react'

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

    const base = (import.meta as any).env?.VITE_API_URL ?? '/api'
    const es = new EventSource(`${base}/rt/stream?token=${encodeURIComponent(token)}`)
    es.onmessage = (msg) => {
      try {
        handler.current(JSON.parse(msg.data))
      } catch {
        /* mensagens de heartbeat/formatos inesperados são ignoradas */
      }
    }
    return () => es.close()
  }, [])
}
