import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useRealtime } from '@condar/ui'
import { useEventos } from '../hooks/useEventos'
import type { Evento } from '../api/eventos'

const resultadoBadge: Record<Evento['resultado'], string> = {
  liberado: 'bg-green-100 text-green-800',
  negado: 'bg-red-100 text-red-800',
  erro: 'bg-yellow-100 text-yellow-800',
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

/** Beep curto (Web Audio, sem arquivo de áudio) para chamar atenção em negados. */
function beepNegado() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 440
    osc.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.setValueAtTime(0.15, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4)
    osc.start()
    osc.stop(ctx.currentTime + 0.4)
  } catch {
    /* autoplay bloqueado antes da primeira interação — ignora */
  }
}

export default function EventFeed() {
  const qc = useQueryClient()
  const { data: eventos, isLoading, isError } = useEventos(30)
  const [novoId, setNovoId] = useState<string | null>(null)
  const idsConhecidos = useRef<Set<string>>(new Set())

  // Eventos de acesso (facial/LPR/QR) chegam na hora via SSE — o polling
  // (useEventos) só serve de rede de segurança se a conexão cair.
  useRealtime((ev) => {
    if (ev.tipo === 'evento_acesso' || ev.tipo === 'visitante_qr') {
      qc.invalidateQueries({ queryKey: ['eventos'] })
    }
  })

  useEffect(() => {
    if (!eventos) return
    const primeiraCarga = idsConhecidos.current.size === 0
    for (const evento of eventos) {
      if (!idsConhecidos.current.has(evento.id)) {
        idsConhecidos.current.add(evento.id)
        if (!primeiraCarga) {
          setNovoId(evento.id)
          if (evento.resultado === 'negado') beepNegado()
          setTimeout(() => setNovoId((atual) => (atual === evento.id ? null : atual)), 2000)
        }
      }
    }
  }, [eventos])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-400 text-sm">
        Carregando eventos...
      </div>
    )
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-full text-red-400 text-sm">
        Erro ao carregar eventos
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-1 overflow-y-auto h-full">
      {eventos && eventos.length === 0 && (
        <div className="text-center text-gray-400 text-sm py-8">Nenhum evento registrado</div>
      )}
      {eventos?.map((evento) => (
        <div
          key={evento.id}
          className={`flex items-center gap-3 p-2 rounded-lg bg-white border transition-colors ${
            evento.id === novoId ? 'border-brand-400 bg-brand-50' : 'border-gray-100 hover:bg-gray-50'
          }`}
        >
          {evento.foto_base64 ? (
            <img
              src={`data:image/jpeg;base64,${evento.foto_base64}`}
              alt="Foto do acesso"
              className="h-10 w-10 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center flex-shrink-0 text-gray-400 text-xs">
              ?
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-gray-900 truncate">
              {evento.pessoa?.nome ?? 'Pessoa não identificada'}
            </p>
            <p className="text-xs text-gray-500">{evento.tipo} · {evento.metodo}</p>
          </div>
          <div className="flex flex-col items-end gap-1 flex-shrink-0">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${resultadoBadge[evento.resultado]}`}>
              {evento.resultado}
            </span>
            <span className="text-xs text-gray-400">{formatTime(evento.criado_em)}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
