import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Button, TextField, Badge, iniciais } from '@condar/ui'
import {
  fetchUnidades,
  fetchOcupantes,
  fetchPessoas,
  adicionarOcupante,
  removerOcupante,
  type Unidade,
  type CreateOcupante,
} from '../api/sindico'
import BottomNav from '../components/BottomNav'

const TIPOS_VINCULO = [
  { value: 'proprietario', label: 'Proprietário' },
  { value: 'inquilino', label: 'Inquilino' },
  { value: 'dependente', label: 'Dependente' },
  { value: 'funcionario', label: 'Funcionário' },
] as const

const FORM_INICIAL = {
  pessoa_id: '',
  tipo_vinculo: 'proprietario' as CreateOcupante['tipo_vinculo'],
  principal: false,
}

function OcupantesDaUnidade({ unidade }: { unidade: Unidade }) {
  const qc = useQueryClient()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [buscaPessoa, setBuscaPessoa] = useState('')
  const [form, setForm] = useState(FORM_INICIAL)
  const [error, setError] = useState<string | null>(null)

  const { data: ocupantes } = useQuery({
    queryKey: ['ocupantes', unidade.id],
    queryFn: () => fetchOcupantes(unidade.id),
  })
  const { data: pessoas } = useQuery({
    queryKey: ['pessoas', buscaPessoa],
    queryFn: () => fetchPessoas(buscaPessoa),
    enabled: mostrarForm,
  })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['ocupantes', unidade.id] })

  const adicionar = useMutation({
    mutationFn: (payload: CreateOcupante) => adicionarOcupante(unidade.id, payload),
    onSuccess: () => {
      invalidar()
      setForm(FORM_INICIAL)
      setMostrarForm(false)
      setError(null)
    },
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao vincular ocupante'),
  })

  const remover = useMutation({
    mutationFn: (vinculoId: string) => removerOcupante(unidade.id, vinculoId),
    onSuccess: invalidar,
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao desvincular'),
  })

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.pessoa_id) return
    adicionar.mutate(form)
  }

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}

      {ocupantes?.map((o) => (
        <div key={o.id} className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-50 text-xs font-bold text-brand-600">
            {iniciais(o.pessoa_nome)}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-gray-900 truncate">{o.pessoa_nome}</span>
            <span className="block text-xs text-gray-500 capitalize">{o.tipo_vinculo}</span>
          </span>
          {o.principal && <Badge tone="green">principal</Badge>}
          <button
            onClick={() => remover.mutate(o.id)}
            disabled={remover.isPending}
            className="text-xs text-brand-600 font-semibold disabled:opacity-50"
          >
            Remover
          </button>
        </div>
      ))}
      {ocupantes?.length === 0 && <p className="text-sm text-gray-500">Nenhum ocupante vinculado.</p>}

      {mostrarForm ? (
        <form onSubmit={onSubmit} className="border-t border-gray-100 pt-3 space-y-3">
          <TextField
            label="Buscar pessoa"
            value={buscaPessoa}
            onChange={(e) => setBuscaPessoa(e.target.value)}
            placeholder="Nome da pessoa"
          />
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Pessoa</span>
            <select
              value={form.pessoa_id}
              onChange={(e) => setForm((p) => ({ ...p, pessoa_id: e.target.value }))}
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
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Vínculo</span>
            <select
              value={form.tipo_vinculo}
              onChange={(e) => setForm((p) => ({ ...p, tipo_vinculo: e.target.value as any }))}
              className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            >
              {TIPOS_VINCULO.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.principal}
              onChange={(e) => setForm((p) => ({ ...p, principal: e.target.checked }))}
            />
            Vínculo principal
          </label>
          <Button type="submit" disabled={adicionar.isPending || !form.pessoa_id} className="w-full">
            {adicionar.isPending ? 'Vinculando...' : 'Vincular ocupante'}
          </Button>
        </form>
      ) : (
        <button
          onClick={() => setMostrarForm(true)}
          className="text-sm text-brand-600 font-semibold"
        >
          + Vincular ocupante
        </button>
      )}
    </div>
  )
}

export default function UnidadesPage() {
  const [busca, setBusca] = useState('')
  const [selecionada, setSelecionada] = useState<string | null>(null)

  const { data: unidades } = useQuery({
    queryKey: ['unidades', busca],
    queryFn: () => fetchUnidades(busca),
  })

  return (
    <AppScreen bottomNav>
      <Header variant="tinta" eyebrow="Gestão do condomínio" title="Unidades" />

      <div className="px-5 mt-4 space-y-3">
        <TextField
          label="Buscar unidade"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Número da unidade"
        />

        {unidades?.map((u) => {
          const aberta = selecionada === u.id
          return (
            <div key={u.id} className="space-y-2">
              <button
                onClick={() => setSelecionada(aberta ? null : u.id)}
                className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 text-left active:opacity-80"
              >
                <span className="flex-1">
                  <span className="block font-semibold text-gray-900">
                    {u.condominio.nome} · {u.bloco.nome} · {u.numero}
                  </span>
                  <span className="block text-sm text-gray-500">
                    {u.andar !== null ? `${u.andar}º andar` : 'Sem andar informado'}
                  </span>
                </span>
                <Badge tone={u.ativa ? 'green' : 'neutral'}>{u.ativa ? 'ativa' : 'inativa'}</Badge>
              </button>
              {aberta && <OcupantesDaUnidade unidade={u} />}
            </div>
          )
        })}
        {unidades?.length === 0 && (
          <p className="text-sm text-gray-500 text-center py-6">Nenhuma unidade encontrada.</p>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
