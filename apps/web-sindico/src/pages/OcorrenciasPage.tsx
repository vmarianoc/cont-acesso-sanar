import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Button, Badge } from '@condar/ui'
import client from '../api/client'
import BottomNav from '../components/BottomNav'

interface Ocorrencia {
  id: string
  titulo: string
  descricao: string
  categoria: string
  status: 'aberta' | 'em_andamento' | 'resolvida'
  unidade_numero: string | null
  criado_em: string
  comentarios: { texto: string; criado_em: string }[]
}

const TONS: Record<string, 'red' | 'neutral' | 'green'> = {
  aberta: 'red',
  em_andamento: 'neutral',
  resolvida: 'green',
}

const fmt = (s: string) =>
  new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function OcorrenciasPage() {
  const qc = useQueryClient()
  const [comentario, setComentario] = useState<Record<string, string>>({})

  const { data: ocorrencias } = useQuery({
    queryKey: ['ocorrencias'],
    queryFn: () => client.get('/ocorrencias').then((r) => r.data.data as Ocorrencia[]),
    refetchInterval: 15000,
  })

  const atualizar = useMutation({
    mutationFn: ({ id, status, texto }: { id: string; status?: string; texto?: string }) =>
      client.patch(`/ocorrencias/${id}`, { status, comentario: texto || undefined }),
    onSuccess: (_r, vars) => {
      qc.invalidateQueries({ queryKey: ['ocorrencias'] })
      setComentario((p) => ({ ...p, [vars.id]: '' }))
    },
  })

  return (
    <AppScreen bottomNav>
      <Header variant="tinta" eyebrow="Livro digital" title="Ocorrências" />

      <div className="px-5 mt-4 space-y-3">
        {ocorrencias?.map((o) => (
          <div key={o.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-gray-900">{o.titulo}</p>
              <Badge tone={TONS[o.status]}>{o.status.replace('_', ' ')}</Badge>
            </div>
            <p className="text-sm text-gray-600 mt-1">{o.descricao}</p>
            <p className="text-xs text-gray-400 mt-1">
              {o.categoria}
              {o.unidade_numero ? ` · Unidade ${o.unidade_numero}` : ''} · {fmt(o.criado_em)}
            </p>

            {o.comentarios.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                {o.comentarios.map((c, i) => (
                  <p key={i} className="text-xs text-gray-600">
                    💬 {c.texto}
                  </p>
                ))}
              </div>
            )}

            {o.status !== 'resolvida' && (
              <div className="mt-3 space-y-2">
                <input
                  value={comentario[o.id] ?? ''}
                  onChange={(e) => setComentario((p) => ({ ...p, [o.id]: e.target.value }))}
                  placeholder="Comentário (opcional)"
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
                <div className="grid grid-cols-2 gap-2">
                  {o.status === 'aberta' && (
                    <Button
                      variant="outline"
                      onClick={() => atualizar.mutate({ id: o.id, status: 'em_andamento', texto: comentario[o.id] })}
                      disabled={atualizar.isPending}
                    >
                      Em andamento
                    </Button>
                  )}
                  <Button
                    onClick={() => atualizar.mutate({ id: o.id, status: 'resolvida', texto: comentario[o.id] })}
                    disabled={atualizar.isPending}
                    className={o.status === 'aberta' ? '' : 'col-span-2'}
                  >
                    Resolver
                  </Button>
                </div>
              </div>
            )}
          </div>
        ))}
        {ocorrencias?.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm">
            Nenhuma ocorrência registrada.
          </div>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
