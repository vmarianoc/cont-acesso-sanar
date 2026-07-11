import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import client from '../api/client'

interface Resultado {
  tipo: 'pessoa' | 'veiculo' | 'unidade' | 'pet'
  id: string
  titulo: string
  detalhe: string | null
}

const ICONES: Record<Resultado['tipo'], string> = {
  pessoa: '👤',
  veiculo: '🚗',
  unidade: '🏢',
  pet: '🐾',
}

/** Busca unificada da guarita: nome, unidade, placa ou documento. */
export default function BuscaGlobal() {
  const [q, setQ] = useState('')
  const { data: resultados } = useQuery({
    queryKey: ['busca', q],
    queryFn: () => client.get(`/busca?q=${encodeURIComponent(q)}`).then((r) => r.data.data as Resultado[]),
    enabled: q.trim().length >= 2,
  })

  return (
    <div className="relative w-56">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar nome, placa, unidade…"
        className="w-full rounded-md bg-white/15 px-3 py-1.5 text-sm text-white placeholder:text-white/50 focus:bg-white focus:text-gray-900 focus:outline-none"
      />
      {q.trim().length >= 2 && resultados && (
        <div className="absolute z-50 mt-1 w-80 max-h-80 overflow-y-auto rounded-lg bg-white shadow-lg border border-gray-200">
          {resultados.map((r) => (
            <div key={`${r.tipo}-${r.id}`} className="flex items-start gap-2 px-3 py-2 border-b border-gray-50 last:border-0">
              <span>{ICONES[r.tipo]}</span>
              <span className="min-w-0">
                <span className="block text-sm font-medium text-gray-900 truncate">{r.titulo}</span>
                {r.detalhe && <span className="block text-xs text-gray-500 truncate">{r.detalhe}</span>}
              </span>
            </div>
          ))}
          {resultados.length === 0 && (
            <p className="px-3 py-2 text-sm text-gray-500">Nada encontrado.</p>
          )}
        </div>
      )}
    </div>
  )
}
