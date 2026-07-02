import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchSolicitacoes, decidirSolicitacao } from '../api/morador'
import BottomNav from '../components/BottomNav'

function iniciais(nome: string) {
  return nome.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()
}

export default function AutorizarPage() {
  const qc = useQueryClient()
  const { data: solicitacoes } = useQuery({
    queryKey: ['solicitacoes'],
    queryFn: fetchSolicitacoes,
    refetchInterval: 8000,
  })
  const decidir = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'liberado' | 'recusado' }) =>
      decidirSolicitacao(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
      qc.invalidateQueries({ queryKey: ['resumo'] })
    },
  })

  const pendente = solicitacoes?.find((s) => s.status === 'pendente')
  const recentes = solicitacoes?.filter((s) => s.status !== 'pendente') ?? []

  return (
    <div className="min-h-screen bg-areia pb-24 max-w-md mx-auto">
      <header className="bg-tinta rounded-b-3xl px-5 pt-6 pb-6 text-white">
        <p className="text-white/50 text-xs tracking-widest uppercase">Portaria virtual</p>
        <h1 className="text-2xl font-bold mt-1">Autorizar visitante</h1>
      </header>

      <div className="px-5 mt-4">
        {pendente ? (
          <div className="bg-white rounded-3xl p-6 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <span className="grid h-20 w-20 place-items-center rounded-full bg-brand-50 text-2xl font-bold text-brand-600">
                {iniciais(pendente.nome)}
              </span>
              <h2 className="text-xl font-bold text-gray-900 mt-3">{pendente.nome}</h2>
              <p className="text-gray-500 text-sm mt-1 capitalize">{pendente.tipo}</p>
              <button className="mt-4 w-full bg-gray-50 rounded-xl py-3 text-sm text-gray-700">
                📷 Ver câmera da portaria
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-5">
              <button
                onClick={() => decidir.mutate({ id: pendente.id, status: 'liberado' })}
                disabled={decidir.isPending}
                className="rounded-xl bg-brand-600 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
              >
                Liberar
              </button>
              <button
                onClick={() => decidir.mutate({ id: pendente.id, status: 'recusado' })}
                disabled={decidir.isPending}
                className="rounded-xl border border-gray-300 py-3 font-semibold text-gray-800 hover:bg-gray-50 disabled:opacity-50"
              >
                Recusar
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-3xl p-8 text-center text-gray-500 shadow-sm">
            Nenhum visitante aguardando no momento.
          </div>
        )}

        <h3 className="text-xs tracking-widest uppercase text-gray-400 mt-6 mb-2 px-1">
          Acessos recentes
        </h3>
        <div className="space-y-2">
          {recentes.map((s) => (
            <div key={s.id} className="bg-white rounded-2xl p-3 shadow-sm flex items-center gap-3">
              <span
                className={`grid h-8 w-8 place-items-center rounded-lg text-white ${s.status === 'liberado' ? 'bg-green-500' : 'bg-brand-600'}`}
              >
                {s.status === 'liberado' ? '✓' : '⛔'}
              </span>
              <span>
                <span className="block font-medium text-gray-900">{s.nome}</span>
                <span className="block text-xs text-gray-500 capitalize">
                  {s.tipo} · {s.status === 'liberado' ? 'liberado por você' : 'recusado'}
                </span>
              </span>
            </div>
          ))}
        </div>
      </div>

      <BottomNav />
    </div>
  )
}
