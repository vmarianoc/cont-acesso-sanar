import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Button, TextField, Badge, IconTile } from '@condar/ui'
import { fetchEncomendas, registrarEncomenda, retirarEncomenda, fetchUnidades } from '../api/admin'
import BottomNav from '../components/BottomNav'

const fmt = (s: string) =>
  new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

export default function EncomendasPage() {
  const qc = useQueryClient()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ unidade_id: '', remetente: '', descricao: '', prateleira: '' })
  const [codigos, setCodigos] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const { data: encomendas } = useQuery({
    queryKey: ['encomendas'],
    queryFn: () => fetchEncomendas(),
    refetchInterval: 15000,
  })
  const { data: unidades } = useQuery({
    queryKey: ['unidades', 'options'],
    queryFn: () => fetchUnidades(),
    enabled: mostrarForm,
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
    onSuccess: () => {
      invalidar()
      setForm({ unidade_id: '', remetente: '', descricao: '', prateleira: '' })
      setMostrarForm(false)
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
  const retiradas = encomendas?.filter((e) => e.status === 'retirada') ?? []

  return (
    <AppScreen bottomNav wide>
      <Header
        variant="tinta"
        eyebrow="Portaria"
        title="Encomendas"
        right={
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-xl"
          >
            {mostrarForm ? 'Fechar' : '+ Registrar'}
          </button>
        }
      />

      <div className="px-5 mt-4 space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}

        {mostrarForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              registrar.mutate()
            }}
            className="bg-white rounded-2xl p-4 shadow-sm space-y-3"
          >
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Unidade</span>
              <select
                value={form.unidade_id}
                onChange={(e) => setForm((p) => ({ ...p, unidade_id: e.target.value }))}
                required
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">— Selecione —</option>
                {unidades?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.bloco.nome} · {u.numero}
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label="Remetente"
              value={form.remetente}
              onChange={(e) => setForm((p) => ({ ...p, remetente: e.target.value }))}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Descrição"
                value={form.descricao}
                onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
              />
              <TextField
                label="Prateleira"
                value={form.prateleira}
                onChange={(e) => setForm((p) => ({ ...p, prateleira: e.target.value }))}
              />
            </div>
            <Button
              type="submit"
              disabled={registrar.isPending || !form.unidade_id || !form.remetente}
              className="w-full"
            >
              {registrar.isPending ? 'Registrando...' : 'Registrar encomenda'}
            </Button>
          </form>
        )}

        <h3 className="text-xs tracking-widest uppercase text-gray-400 px-1">
          Aguardando retirada ({aguardando.length})
        </h3>
        {aguardando.map((e) => (
          <div key={e.id} className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex items-start gap-3">
              <IconTile icon="📦" />
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-gray-900 truncate">{e.remetente}</span>
                <span className="block text-xs text-gray-500">
                  {e.pessoa_nome ?? 'Sem destinatário'}
                  {e.unidade_numero ? ` · Unidade ${e.unidade_numero}` : ''}
                  {e.prateleira ? ` · prateleira ${e.prateleira}` : ''} · {fmt(e.recebida_em)}
                </span>
              </span>
            </div>
            <div className="flex gap-2">
              <input
                value={codigos[e.id] ?? ''}
                onChange={(ev) => setCodigos((p) => ({ ...p, [e.id]: ev.target.value }))}
                placeholder="Código"
                inputMode="numeric"
                className="w-28 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <Button
                onClick={() => retirar.mutate({ id: e.id, codigo: codigos[e.id] ?? '' })}
                disabled={retirar.isPending || !(codigos[e.id] ?? '').trim()}
                className="flex-1"
              >
                Confirmar retirada
              </Button>
            </div>
          </div>
        ))}
        {aguardando.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm">
            Nenhuma encomenda aguardando.
          </div>
        )}

        {retiradas.length > 0 && (
          <>
            <h3 className="text-xs tracking-widest uppercase text-gray-400 mt-4 px-1">Retiradas</h3>
            {retiradas.map((e) => (
              <div key={e.id} className="bg-white rounded-2xl p-3 shadow-sm flex items-center justify-between gap-2">
                <span className="text-sm text-gray-700 truncate">
                  {e.remetente}
                  {e.unidade_numero ? ` · Un. ${e.unidade_numero}` : ''}
                  {e.retirada_em ? ` · ${fmt(e.retirada_em)}` : ''}
                </span>
                <Badge tone="green">Retirada</Badge>
              </div>
            ))}
          </>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
