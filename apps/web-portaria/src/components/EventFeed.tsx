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

export default function EventFeed() {
  const { data: eventos, isLoading, isError } = useEventos(30)

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
          className="flex items-center gap-3 p-2 rounded-lg bg-white border border-gray-100 hover:bg-gray-50 transition-colors"
        >
          {evento.foto_url ? (
            <img
              src={evento.foto_url}
              alt="Foto"
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
