import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Badge } from '@condar/ui'
import { fetchEspacos, fetchReservas, criarReserva, cancelarReserva } from '../api/morador'
import BottomNav from '../components/BottomNav'

const GRADIENTES = ['from-orange-200 to-orange-100', 'from-sky-200 to-sky-100', 'from-emerald-200 to-emerald-100']

function proximaData(offset: number) {
  const d = new Date()
  d.setDate(d.getDate() + 2 + offset)
  return d
}
const fmt = (d: Date | string) =>
  new Date(d).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })

export default function ReservasPage() {
  const qc = useQueryClient()
  const [periodoSel, setPeriodoSel] = useState<Record<string, string>>({})
  const [erro, setErro] = useState<string | null>(null)

  const { data: espacos } = useQuery({ queryKey: ['espacos'], queryFn: fetchEspacos })
  const { data: reservas } = useQuery({ queryKey: ['reservas'], queryFn: fetchReservas })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['reservas'] })

  const reservar = useMutation({
    mutationFn: ({ espaco_id, data, periodo }: { espaco_id: string; data: string; periodo: string }) =>
      criarReserva(espaco_id, data, periodo),
    onSuccess: () => {
      invalidar()
      setErro(null)
    },
    onError: (err: any) => setErro(err.response?.data?.erro?.mensagem ?? 'Não foi possível reservar.'),
  })

  const cancelar = useMutation({
    mutationFn: cancelarReserva,
    onSuccess: invalidar,
    onError: (err: any) => setErro(err.response?.data?.erro?.mensagem ?? 'Não foi possível cancelar.'),
  })

  const ativas = reservas?.filter((r) => r.status !== 'cancelada') ?? []
  const hoje = new Date().toISOString().slice(0, 10)

  return (
    <AppScreen bottomNav>
      <Header eyebrow="Áreas comuns" title="Reservar espaço" />

      <div className="px-5 mt-4 space-y-4">
        {erro && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{erro}</p>}

        {espacos?.map((e, i) => {
          const data = proximaData(i)
          const periodos = e.periodos ?? []
          const periodo = periodoSel[e.id] ?? periodos[0]?.nome
          return (
            <div key={e.id} className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <div className={`h-24 bg-gradient-to-br ${GRADIENTES[i % GRADIENTES.length]} flex items-end p-4`}>
                <span className="font-bold text-gray-800 text-lg">{e.nome}</span>
              </div>
              <div className="p-4 space-y-3">
                <div className="flex flex-wrap gap-2">
                  {periodos.map((p) => (
                    <button
                      key={p.nome}
                      onClick={() => setPeriodoSel((prev) => ({ ...prev, [e.id]: p.nome }))}
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        periodo === p.nome ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {p.nome} {p.inicio}–{p.fim}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-500">
                    {fmt(data)}
                    {e.exige_aprovacao ? ' · sujeito à aprovação' : ''}
                  </span>
                  <button
                    onClick={() =>
                      reservar.mutate({
                        espaco_id: e.id,
                        data: data.toISOString().slice(0, 10),
                        periodo: periodo ?? '',
                      })
                    }
                    disabled={reservar.isPending || !periodo}
                    className="text-brand-600 font-semibold text-sm disabled:opacity-50"
                  >
                    Reservar →
                  </button>
                </div>
              </div>
            </div>
          )
        })}

        {ativas.length > 0 && (
          <h3 className="text-xs tracking-widest uppercase text-gray-400 mt-2 px-1">Minhas reservas</h3>
        )}
        {ativas.map((r) => (
          <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between gap-2">
            <span className="min-w-0">
              <span className="block font-semibold text-gray-900 truncate">{r.espaco_nome}</span>
              <span className="block text-sm text-gray-500">
                {fmt(r.data)}
                {r.periodo ? ` · ${r.periodo}` : ''}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <Badge tone={r.status === 'confirmada' ? 'green' : 'neutral'}>{r.status}</Badge>
              {r.data.slice(0, 10) >= hoje && (
                <button
                  onClick={() => cancelar.mutate(r.id)}
                  disabled={cancelar.isPending}
                  className="text-xs text-brand-600 font-semibold disabled:opacity-50"
                >
                  Cancelar
                </button>
              )}
            </span>
          </div>
        ))}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
