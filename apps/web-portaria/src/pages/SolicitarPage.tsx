import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRealtime } from '@condar/ui'
import client from '../api/client'

interface Solicitacao {
  id: string
  nome: string
  tipo: string
  status: 'pendente' | 'liberado' | 'recusado'
  unidade_numero: string
  criado_em: string
}

interface UnidadeOption {
  id: string
  numero: string
  bloco: { nome: string }
}

const STATUS_ESTILO: Record<string, string> = {
  pendente: 'bg-amber-100 text-amber-800',
  liberado: 'bg-green-100 text-green-800',
  recusado: 'bg-red-100 text-red-800',
}

export default function SolicitarPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState({ nome: '', documento: '', unidade_id: '' })
  const [error, setError] = useState<string | null>(null)

  // Decisão do morador chega via SSE e atualiza a lista na hora.
  useRealtime((ev) => {
    if (ev.tipo === 'solicitacao_decidida') {
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
    }
  })

  const { data: solicitacoes } = useQuery({
    queryKey: ['solicitacoes'],
    queryFn: () => client.get('/solicitacoes').then((r) => r.data.data as Solicitacao[]),
  })
  const { data: unidades } = useQuery({
    queryKey: ['unidades', 'options'],
    queryFn: () => client.get('/unidades?limit=500').then((r) => r.data.data as UnidadeOption[]),
  })

  const solicitar = useMutation({
    mutationFn: () =>
      client.post('/solicitacoes', {
        nome: form.nome,
        documento: form.documento || undefined,
        unidade_id: form.unidade_id,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['solicitacoes'] })
      setForm({ nome: '', documento: '', unidade_id: '' })
      setError(null)
    },
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao solicitar'),
  })

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => navigate('/portaria')}
          className="text-gray-500 hover:text-gray-700 text-sm transition-colors mb-6"
        >
          ← Voltar à Portaria
        </button>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Chamar Morador</h1>
          <p className="text-sm text-gray-500 mb-6">
            O morador recebe a solicitação no app na hora e a decisão aparece aqui em tempo real.
          </p>

          <form
            onSubmit={(e) => {
              e.preventDefault()
              solicitar.mutate()
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700">Nome do visitante</label>
              <input
                value={form.nome}
                onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Unidade</label>
              <select
                value={form.unidade_id}
                onChange={(e) => setForm((p) => ({ ...p, unidade_id: e.target.value }))}
                required
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">— Selecione a unidade —</option>
                {unidades?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.bloco.nome} · {u.numero}
                  </option>
                ))}
              </select>
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button
              type="submit"
              disabled={solicitar.isPending || !form.nome || !form.unidade_id}
              className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {solicitar.isPending ? 'Chamando...' : 'Chamar morador'}
            </button>
          </form>
        </div>

        <h2 className="text-sm font-semibold text-gray-800 mt-6 mb-2">Solicitações recentes</h2>
        <div className="space-y-2">
          {solicitacoes?.map((s) => (
            <div key={s.id} className="bg-white rounded-lg shadow-sm p-3 flex items-center justify-between">
              <span>
                <span className="block text-sm font-medium text-gray-900">{s.nome}</span>
                <span className="block text-xs text-gray-500">Unidade {s.unidade_numero}</span>
              </span>
              <span className={`text-xs font-semibold px-2 py-1 rounded-full capitalize ${STATUS_ESTILO[s.status]}`}>
                {s.status}
              </span>
            </div>
          ))}
          {solicitacoes?.length === 0 && (
            <p className="text-sm text-gray-500">Nenhuma solicitação registrada.</p>
          )}
        </div>
      </div>
    </div>
  )
}
