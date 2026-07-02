import { useQuery } from '@tanstack/react-query'
import { fetchEncomendas } from '../api/morador'
import BottomNav from '../components/BottomNav'

const fmtDia = (s: string) =>
  new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

export default function EncomendasPage() {
  const { data: encomendas } = useQuery({ queryKey: ['encomendas'], queryFn: fetchEncomendas })
  const aguardando = encomendas?.filter((e) => e.status === 'aguardando') ?? []
  const retiradas = encomendas?.filter((e) => e.status === 'retirada') ?? []

  return (
    <div className="min-h-screen bg-areia pb-24 max-w-md mx-auto">
      <header className="bg-tinta rounded-b-3xl px-5 pt-6 pb-6 text-white">
        <p className="text-white/50 text-xs tracking-widest uppercase">Encomendas</p>
        <h1 className="text-2xl font-bold mt-1">
          {aguardando.length} aguardando retirada
        </h1>
      </header>

      <div className="px-5 mt-4 space-y-3">
        {aguardando.map((e) => (
          <div key={e.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-brand-50 text-xl">📦</span>
              <span>
                <span className="block font-semibold text-gray-900">{e.remetente}</span>
                <span className="block text-sm text-gray-500">
                  Recebida {fmtDia(e.recebida_em)}
                  {e.prateleira ? ` · prateleira ${e.prateleira}` : ''}
                  {e.descricao ? ` · ${e.descricao}` : ''}
                </span>
              </span>
            </div>
            {e.codigo_retirada && (
              <div className="mt-3 bg-brand-50/60 rounded-xl py-3 text-center">
                <p className="text-xs tracking-widest uppercase text-gray-500">Código de retirada</p>
                <p className="text-3xl font-bold text-brand-600 tracking-[0.3em] mt-1">
                  {e.codigo_retirada}
                </p>
              </div>
            )}
          </div>
        ))}

        {aguardando.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm">
            Nenhuma encomenda aguardando.
          </div>
        )}

        {retiradas.length > 0 && (
          <>
            <h3 className="text-xs tracking-widest uppercase text-gray-400 mt-4 mb-1 px-1">
              Retiradas
            </h3>
            {retiradas.map((e) => (
              <div key={e.id} className="bg-white rounded-2xl p-3 shadow-sm flex items-center justify-between">
                <span className="text-gray-700">
                  {e.remetente}
                  {e.retirada_em ? ` · ${fmtDia(e.retirada_em)}` : ''}
                </span>
                <span className="text-xs font-medium text-green-700 bg-green-50 px-2 py-1 rounded-full">
                  Retirada
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      <BottomNav />
    </div>
  )
}
