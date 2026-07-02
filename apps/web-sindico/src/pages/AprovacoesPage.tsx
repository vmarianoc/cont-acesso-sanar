import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Button, Badge } from '@condar/ui'
import { fetchAprovacoes, decidirAprovacao, type Aprovacao } from '../api/sindico'
import BottomNav from '../components/BottomNav'

const fmt = (s: string) => new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

function resumoDados(a: Aprovacao) {
  const d = a.dados || {}
  const partes = Object.entries(d).map(([k, v]) => `${k}: ${String(v)}`)
  return partes.join(' · ')
}

export default function AprovacoesPage() {
  const qc = useQueryClient()
  const { data: aprovacoes } = useQuery({
    queryKey: ['aprovacoes', 'todas'],
    queryFn: () => fetchAprovacoes(),
    refetchInterval: 10000,
  })
  const decidir = useMutation({
    mutationFn: ({ id, status }: { id: string; status: 'aprovado' | 'rejeitado' }) =>
      decidirAprovacao(id, status),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['aprovacoes'] })
    },
  })

  const pendentes = aprovacoes?.filter((a) => a.status === 'pendente') ?? []
  const decididas = aprovacoes?.filter((a) => a.status !== 'pendente') ?? []

  return (
    <AppScreen bottomNav>
      <Header variant="tinta" eyebrow="Central de aprovações" title="Aprovações" />

      <div className="px-5 mt-4 space-y-3">
        {pendentes.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm">
            Nenhuma aprovação pendente. 🎉
          </div>
        )}

        {pendentes.map((a) => (
          <div key={a.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="font-semibold text-gray-900 capitalize">{a.tipo.replace(/_/g, ' ')}</p>
                <p className="text-sm text-gray-500">
                  {a.pessoa_nome ?? '—'}
                  {a.unidade_numero ? ` · Unidade ${a.unidade_numero}` : ''}
                </p>
                {resumoDados(a) && <p className="text-xs text-gray-400 mt-1">{resumoDados(a)}</p>}
              </div>
              <span className="text-xs text-gray-400">{fmt(a.criado_em)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-3">
              <Button
                onClick={() => decidir.mutate({ id: a.id, status: 'aprovado' })}
                disabled={decidir.isPending}
              >
                Aprovar
              </Button>
              <Button
                variant="outline"
                onClick={() => decidir.mutate({ id: a.id, status: 'rejeitado' })}
                disabled={decidir.isPending}
              >
                Reprovar
              </Button>
            </div>
          </div>
        ))}

        {decididas.length > 0 && (
          <>
            <h3 className="text-xs tracking-widest uppercase text-gray-400 mt-4 mb-1 px-1">Histórico</h3>
            {decididas.map((a) => (
              <div key={a.id} className="bg-white rounded-2xl p-3 shadow-sm flex items-center justify-between">
                <span className="text-gray-700 text-sm capitalize">
                  {a.tipo.replace(/_/g, ' ')} · {a.pessoa_nome ?? '—'}
                </span>
                <Badge tone={a.status === 'aprovado' ? 'green' : 'red'}>{a.status}</Badge>
              </div>
            ))}
          </>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
