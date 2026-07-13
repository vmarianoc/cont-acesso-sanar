import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Badge, TextField } from '@condar/ui'
import client from '../api/client'
import BottomNav from '../components/BottomNav'

interface CondominioLicenca {
  id: string
  nome: string
  plano: string
  ativo: boolean
  validade: string | null
  license_key: string | null
  edge_fingerprint: string | null
  licenca_ativa: boolean | null
}

const fmtData = (s: string | null) => (s ? new Date(s).toLocaleDateString('pt-BR') : '—')

export default function LicencasPage() {
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: condominios } = useQuery({
    queryKey: ['licencas', busca],
    queryFn: () =>
      client
        .get(`/admin/condominios${busca ? `?busca=${encodeURIComponent(busca)}` : ''}`)
        .then((r) => r.data.data as CondominioLicenca[]),
  })

  const atualizar = useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string
      payload: { renovar_dias?: number; ativa?: boolean; desvincular_hardware?: boolean }
    }) => client.patch(`/admin/condominios/${id}/licenca`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['licencas'] })
      setError(null)
    },
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao atualizar licença'),
  })

  const desvincular = (c: CondominioLicenca) => {
    if (!confirm(`Desvincular o hardware da licença de "${c.nome}"? O próximo Edge que validar essa chave passa a ser o novo dono.`))
      return
    atualizar.mutate({ id: c.id, payload: { desvincular_hardware: true } })
  }

  return (
    <AppScreen bottomNav>
      <Header eyebrow="Condar" title="Licenças" />

      <div className="px-5 mt-4 space-y-3">
        <TextField
          label="Buscar por condomínio ou chave de licença"
          placeholder="Ex.: AP-3F2A... ou nome do condomínio"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}

        {condominios?.map((c) => {
          const expirada = !!c.validade && new Date(c.validade).getTime() < Date.now()
          return (
            <div key={c.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-2">
              <div className="flex items-start justify-between gap-2">
                <span className="min-w-0">
                  <span className="block font-semibold text-gray-900 truncate">{c.nome}</span>
                  <span className="block text-xs font-mono text-gray-500 break-all">
                    {c.license_key ?? 'sem chave gerada'}
                  </span>
                </span>
                <Badge tone={c.licenca_ativa && !expirada ? 'green' : 'red'}>
                  {!c.licenca_ativa ? 'suspensa' : expirada ? 'expirada' : 'ativa'}
                </Badge>
              </div>

              <p className="text-xs text-gray-500">
                Validade: {fmtData(c.validade)} · Hardware:{' '}
                {c.edge_fingerprint ? (
                  <span className="font-mono">{c.edge_fingerprint.slice(0, 12)}…</span>
                ) : (
                  'não vinculado ainda'
                )}
              </p>

              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold pt-1">
                <button
                  onClick={() => atualizar.mutate({ id: c.id, payload: { renovar_dias: 365 } })}
                  disabled={atualizar.isPending}
                  className="rounded-lg bg-brand-50 text-brand-700 px-3 py-1.5 disabled:opacity-50"
                >
                  Renovar 12 meses
                </button>
                <button
                  onClick={() => atualizar.mutate({ id: c.id, payload: { ativa: !c.licenca_ativa } })}
                  disabled={atualizar.isPending}
                  className="rounded-lg bg-gray-100 text-gray-700 px-3 py-1.5 disabled:opacity-50"
                >
                  {c.licenca_ativa ? 'Suspender' : 'Reativar'} licença
                </button>
                {c.edge_fingerprint && (
                  <button
                    onClick={() => desvincular(c)}
                    disabled={atualizar.isPending}
                    className="rounded-lg bg-amber-50 text-amber-700 px-3 py-1.5 disabled:opacity-50"
                  >
                    Desvincular hardware
                  </button>
                )}
              </div>
            </div>
          )
        })}

        {condominios?.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm">
            Nenhum condomínio encontrado.
          </div>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
