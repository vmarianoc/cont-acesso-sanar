import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Button, Badge } from '@condar/ui'
import client from '../api/client'
import BottomNav from '../components/BottomNav'

interface Fatura {
  id: string
  condominio: string
  tenant_id: string
  competencia: string
  valor_centavos: number
  status: 'aberta' | 'paga' | 'cancelada'
  vencimento: string
  metodo_pagamento: string | null
  linha_digitavel: string | null
  pix_copia_cola: string | null
  pago_em: string | null
}

interface CondominioRede {
  id: string
  nome: string
  plano: string
}

const reais = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const fmt = (s: string) => new Date(s).toLocaleDateString('pt-BR')
const TONS: Record<string, 'green' | 'red' | 'neutral'> = { paga: 'green', aberta: 'red', cancelada: 'neutral' }

export default function FaturasPage() {
  const qc = useQueryClient()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ tenant_id: '', competencia: new Date().toISOString().slice(0, 7) })
  const [error, setError] = useState<string | null>(null)

  const { data: faturas } = useQuery({
    queryKey: ['faturas'],
    queryFn: () => client.get('/admin/faturas').then((r) => r.data.data as Fatura[]),
  })
  const { data: condominios } = useQuery({
    queryKey: ['rede', 'condominios'],
    queryFn: () => client.get('/admin/condominios').then((r) => r.data.data as CondominioRede[]),
    enabled: mostrarForm,
  })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['faturas'] })

  const gerar = useMutation({
    mutationFn: () => client.post('/admin/faturas', form),
    onSuccess: () => {
      invalidar()
      setMostrarForm(false)
      setError(null)
    },
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao gerar cobrança'),
  })

  const acao = useMutation({
    mutationFn: ({ id, tipo }: { id: string; tipo: 'baixa-manual' | 'cancelar' }) =>
      client.post(`/admin/faturas/${id}/${tipo}`),
    onSuccess: invalidar,
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha na operação'),
  })

  return (
    <AppScreen bottomNav wide>
      <Header
        eyebrow="Billing · Banco Cora"
        title="Faturas"
        right={
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-xl"
          >
            {mostrarForm ? 'Fechar' : '+ Cobrança'}
          </button>
        }
      />

      <div className="px-5 mt-4 space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}

        {mostrarForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              gerar.mutate()
            }}
            className="bg-white rounded-2xl p-4 shadow-sm space-y-3"
          >
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Condomínio</span>
              <select
                value={form.tenant_id}
                onChange={(e) => setForm((p) => ({ ...p, tenant_id: e.target.value }))}
                required
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">— Selecione —</option>
                {condominios?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} ({c.plano.toUpperCase()})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Competência</span>
              <input
                type="month"
                value={form.competencia}
                onChange={(e) => setForm((p) => ({ ...p, competencia: e.target.value }))}
                required
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </label>
            <p className="text-xs text-gray-400">
              O valor é o preço do plano do condomínio; o boleto/Pix é emitido no Banco Cora e o
              pagamento estende a licença em 1 mês automaticamente.
            </p>
            <Button type="submit" disabled={gerar.isPending || !form.tenant_id} className="w-full">
              {gerar.isPending ? 'Emitindo na Cora...' : 'Emitir cobrança'}
            </Button>
          </form>
        )}

        {faturas?.map((f) => (
          <div key={f.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block font-semibold text-gray-900 truncate">{f.condominio}</span>
                <span className="block text-xs text-gray-500">
                  {f.competencia.slice(0, 7)} · {reais(f.valor_centavos)} · vence {fmt(f.vencimento)}
                  {f.pago_em ? ` · pago em ${fmt(f.pago_em)} (${f.metodo_pagamento})` : ''}
                </span>
              </span>
              <Badge tone={TONS[f.status]}>{f.status}</Badge>
            </div>
            {f.status === 'aberta' && (
              <>
                {f.linha_digitavel && (
                  <p className="mt-2 break-all rounded-xl bg-gray-50 p-2 font-mono text-[10px] text-gray-700">
                    {f.linha_digitavel}
                  </p>
                )}
                <div className="mt-2 flex gap-3 text-xs font-semibold">
                  <button
                    onClick={() => acao.mutate({ id: f.id, tipo: 'baixa-manual' })}
                    disabled={acao.isPending}
                    className="text-green-700 disabled:opacity-50"
                  >
                    Baixa manual
                  </button>
                  <button
                    onClick={() => acao.mutate({ id: f.id, tipo: 'cancelar' })}
                    disabled={acao.isPending}
                    className="text-brand-600 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </>
            )}
          </div>
        ))}
        {faturas?.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm">
            Nenhuma fatura emitida.
          </div>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
