import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Button, iniciais } from '@condar/ui'
import { fetchSolicitacoes, decidirSolicitacao, fetchFotosAcesso } from '../api/morador'
import BottomNav from '../components/BottomNav'
import ConvidarVisitante from '../components/ConvidarVisitante'

export default function AutorizarPage() {
  const qc = useQueryClient()
  const { data: solicitacoes } = useQuery({
    queryKey: ['solicitacoes'],
    queryFn: fetchSolicitacoes,
    refetchInterval: 8000,
  })
  const { data: fotosAcesso } = useQuery({
    queryKey: ['fotos-acesso'],
    queryFn: fetchFotosAcesso,
    refetchInterval: 15000,
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
    <AppScreen bottomNav>
      <Header variant="tinta" eyebrow="Portaria virtual" title="Autorizar visitante" />

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
              <Button
                onClick={() => decidir.mutate({ id: pendente.id, status: 'liberado' })}
                disabled={decidir.isPending}
              >
                Liberar
              </Button>
              <Button
                variant="outline"
                onClick={() => decidir.mutate({ id: pendente.id, status: 'recusado' })}
                disabled={decidir.isPending}
              >
                Recusar
              </Button>
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
        {!!fotosAcesso?.length && (
          <>
            <h3 className="text-xs tracking-widest uppercase text-gray-400 mt-6 mb-2 px-1">
              Fotos das últimas entradas
            </h3>
            <p className="text-xs text-gray-400 px-1 mb-2">
              Fila temporária (só as 5 mais recentes) — facial e veículo.
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {fotosAcesso.map((f) => (
                <div key={f.evento_id} className="shrink-0 w-24 text-center">
                  <img
                    src={`data:image/jpeg;base64,${f.foto_base64}`}
                    alt={`Acesso ${f.metodo}`}
                    className="w-24 h-24 object-cover rounded-xl shadow-sm"
                  />
                  <span className="block text-[10px] text-gray-500 mt-1 capitalize">
                    {f.metodo} · {new Date(f.criado_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}

        <ConvidarVisitante />
      </div>

      <BottomNav />
    </AppScreen>
  )
}
