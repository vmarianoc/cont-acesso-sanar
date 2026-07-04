import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Button, TextField, Badge } from '@condar/ui'
import client from '../api/client'
import BottomNav from '../components/BottomNav'

interface Ocorrencia {
  id: string
  titulo: string
  descricao: string
  categoria: string
  status: 'aberta' | 'em_andamento' | 'resolvida'
  criado_em: string
  comentarios: { texto: string; criado_em: string }[]
}

const CATEGORIAS = [
  { value: 'barulho', label: 'Barulho' },
  { value: 'manutencao', label: 'Manutenção' },
  { value: 'seguranca', label: 'Segurança' },
  { value: 'outros', label: 'Outros' },
] as const

const TONS: Record<string, 'red' | 'neutral' | 'green'> = {
  aberta: 'red',
  em_andamento: 'neutral',
  resolvida: 'green',
}

export default function OcorrenciasPage() {
  const qc = useQueryClient()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ titulo: '', descricao: '', categoria: 'outros' })
  const [error, setError] = useState<string | null>(null)

  const { data: ocorrencias } = useQuery({
    queryKey: ['ocorrencias'],
    queryFn: () => client.get('/ocorrencias').then((r) => r.data.data as Ocorrencia[]),
    refetchInterval: 15000,
  })

  const abrir = useMutation({
    mutationFn: () => client.post('/ocorrencias', form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ocorrencias'] })
      setForm({ titulo: '', descricao: '', categoria: 'outros' })
      setMostrarForm(false)
      setError(null)
    },
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao registrar'),
  })

  return (
    <AppScreen bottomNav>
      <Header
        variant="tinta"
        eyebrow="Fale com o síndico"
        title="Ocorrências"
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
              abrir.mutate()
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
              <span className="text-sm font-medium text-gray-700">Descrição</span>
              <textarea
                value={form.descricao}
                onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))}
                required
                rows={3}
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Categoria</span>
              <select
                value={form.categoria}
                onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))}
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {CATEGORIAS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={abrir.isPending || !form.titulo || !form.descricao} className="w-full">
              {abrir.isPending ? 'Registrando...' : 'Registrar ocorrência'}
            </Button>
          </form>
        )}

        {ocorrencias?.map((o) => (
          <div key={o.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-gray-900">{o.titulo}</p>
              <Badge tone={TONS[o.status]}>{o.status.replace('_', ' ')}</Badge>
            </div>
            <p className="text-sm text-gray-600 mt-1">{o.descricao}</p>
            {o.comentarios.length > 0 && (
              <div className="mt-2 space-y-1 border-t border-gray-100 pt-2">
                {o.comentarios.map((c, i) => (
                  <p key={i} className="text-xs text-gray-600">
                    💬 Síndico: {c.texto}
                  </p>
                ))}
              </div>
            )}
          </div>
        ))}
        {ocorrencias?.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm">
            Você ainda não registrou ocorrências.
          </div>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
