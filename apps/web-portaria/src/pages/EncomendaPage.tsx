import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { fetchUnidades, fetchEncomendas, registrarEncomenda, retirarEncomenda, type Encomenda } from '../api/encomendas'

const inputCls =
  'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

const fmt = (s: string) =>
  new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function EncomendaPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState({ unidade_id: '', remetente: '', descricao: '', prateleira: '' })
  const [codigos, setCodigos] = useState<Record<string, string>>({})
  const [gerada, setGerada] = useState<Encomenda | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: unidades } = useQuery({ queryKey: ['unidades', 'options'], queryFn: () => fetchUnidades() })
  const { data: encomendas } = useQuery({
    queryKey: ['encomendas'],
    queryFn: () => fetchEncomendas(),
    refetchInterval: 15000,
  })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['encomendas'] })

  const registrar = useMutation({
    mutationFn: () =>
      registrarEncomenda({
        unidade_id: form.unidade_id,
        remetente: form.remetente,
        descricao: form.descricao || undefined,
        prateleira: form.prateleira || undefined,
      }),
    onSuccess: (encomenda) => {
      invalidar()
      setGerada(encomenda)
      setForm({ unidade_id: '', remetente: '', descricao: '', prateleira: '' })
      setError(null)
    },
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao registrar'),
  })

  const retirar = useMutation({
    mutationFn: ({ id, codigo }: { id: string; codigo: string }) => retirarEncomenda(id, codigo),
    onSuccess: () => {
      invalidar()
      setError(null)
    },
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha na retirada'),
  })

  const aguardando = encomendas?.filter((e) => e.status === 'aguardando') ?? []

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
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Registrar Encomenda</h1>
          <p className="text-sm text-gray-500 mb-6">
            O morador é avisado na hora e recebe o código de retirada pelo app.
          </p>

          {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md mb-4">{error}</p>}

          {gerada && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4 mb-4">
              <p className="text-sm font-medium text-green-800">
                Encomenda de {gerada.remetente} registrada
                {gerada.unidade_numero ? ` — unidade ${gerada.unidade_numero}` : ''}
              </p>
              <p className="text-xs text-green-700 mt-1">Código de retirada:</p>
              <p className="text-2xl font-bold tracking-widest text-green-900 font-mono">
                {gerada.codigo_retirada}
              </p>
              <button onClick={() => setGerada(null)} className="text-xs font-semibold text-green-700 mt-2">
                Fechar
              </button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault()
              registrar.mutate()
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700">Unidade</label>
              <select
                value={form.unidade_id}
                onChange={(e) => setForm((p) => ({ ...p, unidade_id: e.target.value }))}
                required
                className={inputCls}
              >
                <option value="">— Selecione —</option>
                {unidades?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.bloco.nome} · {u.numero}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Remetente</label>
              <input
                value={form.remetente}
                onChange={(e) => setForm((p) => ({ ...p, remetente: e.target.value }))}
                required
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Descrição (opcional)</label>
                <input
                  value={form.descricao}
                  onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                  className={inputCls}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Prateleira (opcional)</label>
                <input
                  value={form.prateleira}
                  onChange={(e) => setForm((p) => ({ ...p, prateleira: e.target.value }))}
                  className={inputCls}
                />
              </div>
            </div>
            <button
              type="submit"
              disabled={registrar.isPending || !form.unidade_id || !form.remetente}
              className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {registrar.isPending ? 'Registrando...' : 'Registrar encomenda'}
            </button>
          </form>
        </div>

        <div className="mt-6">
          <h2 className="text-xs tracking-widest uppercase text-gray-400 mb-2 px-1">
            Aguardando retirada ({aguardando.length})
          </h2>
          <div className="space-y-3">
            {aguardando.map((e) => (
              <div key={e.id} className="bg-white rounded-xl shadow-sm p-4 space-y-3">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{e.remetente}</p>
                  <p className="text-xs text-gray-500">
                    {e.pessoa_nome ?? 'Sem destinatário'}
                    {e.unidade_numero ? ` · Unidade ${e.unidade_numero}` : ''}
                    {e.prateleira ? ` · prateleira ${e.prateleira}` : ''} · {fmt(e.recebida_em)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <input
                    value={codigos[e.id] ?? ''}
                    onChange={(ev) => setCodigos((p) => ({ ...p, [e.id]: ev.target.value }))}
                    placeholder="Código"
                    inputMode="numeric"
                    className="w-28 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <button
                    onClick={() => retirar.mutate({ id: e.id, codigo: codigos[e.id] ?? '' })}
                    disabled={retirar.isPending || !(codigos[e.id] ?? '').trim()}
                    className="flex-1 rounded-md bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium px-4 py-2 transition-colors disabled:opacity-50"
                  >
                    Confirmar retirada
                  </button>
                </div>
              </div>
            ))}
            {aguardando.length === 0 && (
              <div className="bg-white rounded-xl shadow-sm p-6 text-center text-sm text-gray-500">
                Nenhuma encomenda aguardando.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
