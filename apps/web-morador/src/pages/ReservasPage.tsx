import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchEspacos, fetchReservas, criarReserva } from '../api/morador'
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
  const { data: espacos } = useQuery({ queryKey: ['espacos'], queryFn: fetchEspacos })
  const { data: reservas } = useQuery({ queryKey: ['reservas'], queryFn: fetchReservas })
  const reservar = useMutation({
    mutationFn: ({ espaco_id, data }: { espaco_id: string; data: string }) =>
      criarReserva(espaco_id, data, '19h–22h'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas'] }),
  })

  return (
    <div className="min-h-screen bg-areia pb-24 max-w-md mx-auto">
      <header className="bg-brand-600 rounded-b-3xl px-5 pt-6 pb-6 text-white">
        <p className="text-white/70 text-xs tracking-widest uppercase">Áreas comuns</p>
        <h1 className="text-2xl font-bold mt-1">Reservar espaço</h1>
      </header>

      <div className="px-5 mt-4 space-y-4">
        {reservar.isError && (
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">
            Não foi possível reservar (data pode estar ocupada).
          </p>
        )}

        {espacos?.map((e, i) => {
          const data = proximaData(i)
          return (
            <div key={e.id} className="bg-white rounded-2xl overflow-hidden shadow-sm">
              <div className={`h-28 bg-gradient-to-br ${GRADIENTES[i % GRADIENTES.length]} flex items-end p-4`}>
                <span className="font-bold text-gray-800 text-lg">{e.nome}</span>
              </div>
              <div className="flex items-center justify-between p-4">
                <span className="text-sm text-gray-500">{fmt(data)} · livre</span>
                <button
                  onClick={() =>
                    reservar.mutate({ espaco_id: e.id, data: data.toISOString().slice(0, 10) })
                  }
                  disabled={reservar.isPending}
                  className="text-brand-600 font-semibold text-sm disabled:opacity-50"
                >
                  Reservar →
                </button>
              </div>
            </div>
          )
        })}

        {reservas?.map((r) => (
          <div key={r.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
            <span>
              <span className="block font-semibold text-gray-900">Sua reserva: {r.espaco_nome}</span>
              <span className="block text-sm text-gray-500">
                {fmt(r.data)}
                {r.periodo ? ` · ${r.periodo}` : ''}
              </span>
            </span>
            <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full capitalize">
              {r.status}
            </span>
          </div>
        ))}
      </div>

      <BottomNav />
    </div>
  )
}
