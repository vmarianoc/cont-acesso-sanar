import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Button, TextField, Badge, iniciais } from '@condar/ui'
import { fetchLiberacoes, criarLiberacao, revogarLiberacao, fetchPessoas } from '../api/admin'
import BottomNav from '../components/BottomNav'

const ORIGEM: Record<string, string> = {
  reserva: 'via reserva',
  visitante: 'pré-autorização',
  manual: 'manual',
}

const fmtJanela = (de: string, ate: string) => {
  const f = (s: string) =>
    new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
  return `${f(de)} → ${f(ate)}`
}

export default function LiberacoesPage() {
  const qc = useQueryClient()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [buscaPessoa, setBuscaPessoa] = useState('')
  const [form, setForm] = useState({ pessoa_id: '', area: '', valido_de: '', valido_ate: '' })
  const [recorrente, setRecorrente] = useState(false)
  const [rec, setRec] = useState({ dias: [] as number[], hora_inicio: '08:00', hora_fim: '18:00' })
  const [error, setError] = useState<string | null>(null)

  const { data: liberacoes } = useQuery({
    queryKey: ['liberacoes'],
    queryFn: () => fetchLiberacoes(),
    refetchInterval: 15000,
  })
  const { data: pessoas } = useQuery({
    queryKey: ['pessoas', buscaPessoa],
    queryFn: () => fetchPessoas(buscaPessoa || undefined),
    enabled: mostrarForm,
  })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['liberacoes'] })

  const criar = useMutation({
    mutationFn: () =>
      criarLiberacao({
        pessoa_id: form.pessoa_id,
        area: form.area,
        valido_de: new Date(form.valido_de).toISOString(),
        valido_ate: new Date(form.valido_ate).toISOString(),
        ...(recorrente && rec.dias.length ? { recorrencia: rec } : {}),
      }),
    onSuccess: () => {
      invalidar()
      setForm({ pessoa_id: '', area: '', valido_de: '', valido_ate: '' })
      setMostrarForm(false)
      setError(null)
    },
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao liberar'),
  })

  const revogar = useMutation({
    mutationFn: (id: string) => revogarLiberacao(id),
    onSuccess: invalidar,
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao revogar'),
  })

  const vigente = (l: { valido_de: string; valido_ate: string }) => {
    const agora = Date.now()
    return agora >= new Date(l.valido_de).getTime() && agora <= new Date(l.valido_ate).getTime()
  }

  return (
    <AppScreen bottomNav wide>
      <Header
        variant="tinta"
        eyebrow="Controle de acesso"
        title="Liberações por área"
        right={
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-xl"
          >
            {mostrarForm ? 'Fechar' : '+ Liberar'}
          </button>
        }
      />

      <div className="px-5 mt-4 space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}

        {mostrarForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              criar.mutate()
            }}
            className="bg-white rounded-2xl p-4 shadow-sm space-y-3"
          >
            <TextField
              label="Buscar pessoa"
              placeholder="Nome"
              value={buscaPessoa}
              onChange={(e) => setBuscaPessoa(e.target.value)}
            />
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Pessoa</span>
              <select
                value={form.pessoa_id}
                onChange={(e) => setForm((p) => ({ ...p, pessoa_id: e.target.value }))}
                required
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">— Selecione —</option>
                {pessoas?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({p.tipo})
                  </option>
                ))}
              </select>
            </label>
            <TextField
              label="Área (ex.: portaria, salão_de_festas)"
              value={form.area}
              onChange={(e) => setForm((p) => ({ ...p, area: e.target.value }))}
              required
            />
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Válido de</span>
                <input
                  type="datetime-local"
                  value={form.valido_de}
                  onChange={(e) => setForm((p) => ({ ...p, valido_de: e.target.value }))}
                  required
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium text-gray-700">Válido até</span>
                <input
                  type="datetime-local"
                  value={form.valido_ate}
                  onChange={(e) => setForm((p) => ({ ...p, valido_ate: e.target.value }))}
                  required
                  className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                />
              </label>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={recorrente} onChange={(e) => setRecorrente(e.target.checked)} />
              Recorrente (prestador fixo: dias da semana + horário)
            </label>
            {recorrente && (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-1">
                  {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d, i) => (
                    <button
                      type="button"
                      key={d}
                      onClick={() =>
                        setRec((p) => ({
                          ...p,
                          dias: p.dias.includes(i + 1) ? p.dias.filter((x) => x !== i + 1) : [...p.dias, i + 1],
                        }))
                      }
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                        rec.dias.includes(i + 1) ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {d}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Das</span>
                    <input type="time" value={rec.hora_inicio} onChange={(e) => setRec((p) => ({ ...p, hora_inicio: e.target.value }))} className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm" />
                  </label>
                  <label className="block">
                    <span className="text-sm font-medium text-gray-700">Até</span>
                    <input type="time" value={rec.hora_fim} onChange={(e) => setRec((p) => ({ ...p, hora_fim: e.target.value }))} className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm" />
                  </label>
                </div>
              </div>
            )}
            <Button
              type="submit"
              disabled={criar.isPending || !form.pessoa_id || !form.area || !form.valido_de || !form.valido_ate}
              className="w-full"
            >
              {criar.isPending ? 'Liberando...' : 'Criar liberação facial'}
            </Button>
          </form>
        )}

        {liberacoes?.map((l) => {
          const nome = l.pessoa_nome ?? l.visitante_nome ?? '—'
          return (
            <div key={l.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
                {iniciais(nome)}
              </span>
              <span className="flex-1 min-w-0">
                <span className="block font-semibold text-gray-900 truncate">{nome}</span>
                <span className="block text-xs text-gray-500">
                  {l.area} · {ORIGEM[l.origem_tipo] ?? l.origem_tipo} · {fmtJanela(l.valido_de, l.valido_ate)}
                </span>
              </span>
              <span className="flex flex-col items-end gap-1">
                <Badge tone={vigente(l) ? 'green' : 'neutral'}>
                  {vigente(l) ? 'vigente' : 'fora da janela'}
                </Badge>
                <button
                  onClick={() => revogar.mutate(l.id)}
                  disabled={revogar.isPending}
                  className="text-xs text-brand-600 font-semibold disabled:opacity-50"
                >
                  Revogar
                </button>
              </span>
            </div>
          )
        })}
        {liberacoes?.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm">
            Nenhuma liberação ativa.
          </div>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
