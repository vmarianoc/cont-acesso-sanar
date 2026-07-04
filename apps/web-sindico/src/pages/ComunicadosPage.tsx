import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Button, TextField, Badge } from '@condar/ui'
import { fetchComunicados, publicarComunicado, removerComunicado } from '../api/sindico'
import BottomNav from '../components/BottomNav'

const fmt = (s: string) =>
  new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export default function ComunicadosPage() {
  const qc = useQueryClient()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ titulo: '', corpo: '', prioridade: 'normal' })
  const [error, setError] = useState<string | null>(null)

  const { data: comunicados } = useQuery({
    queryKey: ['comunicados'],
    queryFn: fetchComunicados,
    refetchInterval: 10000,
  })
  const invalidar = () => qc.invalidateQueries({ queryKey: ['comunicados'] })

  const publicar = useMutation({
    mutationFn: () => publicarComunicado(form),
    onSuccess: () => {
      invalidar()
      setForm({ titulo: '', corpo: '', prioridade: 'normal' })
      setMostrarForm(false)
      setError(null)
    },
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao publicar'),
  })

  const remover = useMutation({
    mutationFn: (id: string) => removerComunicado(id),
    onSuccess: invalidar,
  })

  return (
    <AppScreen bottomNav>
      <Header
        variant="tinta"
        eyebrow="Mural do condomínio"
        title="Comunicados"
        right={
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-xl"
          >
            {mostrarForm ? 'Fechar' : '+ Publicar'}
          </button>
        }
      />

      <div className="px-5 mt-4 space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}

        {mostrarForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              publicar.mutate()
            }}
            className="bg-white rounded-2xl p-4 shadow-sm space-y-3"
          >
            <TextField
              label="Título"
              value={form.titulo}
              onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
              required
            />
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Mensagem</span>
              <textarea
                value={form.corpo}
                onChange={(e) => setForm((p) => ({ ...p, corpo: e.target.value }))}
                required
                rows={4}
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={form.prioridade === 'urgente'}
                onChange={(e) => setForm((p) => ({ ...p, prioridade: e.target.checked ? 'urgente' : 'normal' }))}
              />
              Urgente
            </label>
            <Button type="submit" disabled={publicar.isPending || !form.titulo || !form.corpo} className="w-full">
              {publicar.isPending ? 'Publicando...' : 'Publicar para todos os moradores'}
            </Button>
          </form>
        )}

        {comunicados?.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-gray-900">{c.titulo}</p>
              {c.prioridade === 'urgente' && <Badge tone="red">urgente</Badge>}
            </div>
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{c.corpo}</p>
            <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
              <span>
                {fmt(c.criado_em)} · {c.leituras} leitura(s)
              </span>
              <button
                onClick={() => remover.mutate(c.id)}
                disabled={remover.isPending}
                className="text-brand-600 font-semibold disabled:opacity-50"
              >
                Remover
              </button>
            </div>
          </div>
        ))}
        {comunicados?.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm">
            Nenhum comunicado publicado.
          </div>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
