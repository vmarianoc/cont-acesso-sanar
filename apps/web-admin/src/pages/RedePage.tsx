import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Button, TextField, Badge, Stat } from '@condar/ui'
import client from '../api/client'
import BottomNav from '../components/BottomNav'

interface ResumoRede {
  condominios: number
  unidades: number
  moradores: number
  ocorrencias_abertas: number
  licencas_a_vencer_30d: number
}

interface CondominioRede {
  id: string
  nome: string
  plano: string
  ativo: boolean
  validade: string | null
  max_unidades: number | null
  unidades: number
  moradores: number
  ocorrencias_abertas: number
}

export default function RedePage() {
  const qc = useQueryClient()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ nome: '', plano: 'start', sindico_nome: '', sindico_email: '' })
  const [convite, setConvite] = useState<{ nome: string; token: string } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: resumo } = useQuery({
    queryKey: ['rede', 'resumo'],
    queryFn: () => client.get('/admin/resumo').then((r) => r.data.data as ResumoRede),
  })
  const { data: condominios } = useQuery({
    queryKey: ['rede', 'condominios'],
    queryFn: () => client.get('/admin/condominios').then((r) => r.data.data as CondominioRede[]),
  })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['rede'] })

  const criar = useMutation({
    mutationFn: () => client.post('/admin/condominios', form).then((r) => r.data.data),
    onSuccess: (data) => {
      invalidar()
      setConvite({ nome: data.nome, token: data.convite_sindico })
      setForm({ nome: '', plano: 'start', sindico_nome: '', sindico_email: '' })
      setMostrarForm(false)
      setError(null)
    },
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao criar condomínio'),
  })

  const atualizar = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: { ativo?: boolean; plano?: string } }) =>
      client.patch(`/admin/condominios/${id}`, payload),
    onSuccess: invalidar,
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao atualizar'),
  })

  const baixarEdgeConfig = async (id: string, nome: string) => {
    try {
      const res = await client.get(`/admin/condominios/${id}/edge-config`, { responseType: 'blob' })
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = `edge.config.${nome.replace(/[^a-zA-Z0-9]+/g, '_')}.json`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err: any) {
      setError(err.response?.data?.erro?.mensagem ?? 'Falha ao gerar configuração do Edge')
    }
  }

  return (
    <AppScreen bottomNav>
      <Header
        eyebrow="Administradora"
        title="Minha rede"
        right={
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-xl"
          >
            {mostrarForm ? 'Fechar' : '+ Condomínio'}
          </button>
        }
      />

      <div className="px-5 mt-4 space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}

        {resumo && (
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Condomínios ativos" value={resumo.condominios} />
            <Stat label="Unidades na rede" value={resumo.unidades} />
            <Stat label="Moradores ativos" value={resumo.moradores} />
            <Stat label="Licenças a vencer (30d)" value={resumo.licencas_a_vencer_30d} />
          </div>
        )}

        {mostrarForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              criar.mutate()
            }}
            className="bg-white rounded-2xl p-4 shadow-sm space-y-3"
          >
            <TextField
              label="Nome do condomínio"
              value={form.nome}
              onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
              required
            />
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Plano</span>
              <select
                value={form.plano}
                onChange={(e) => setForm((p) => ({ ...p, plano: e.target.value }))}
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="start">START (até 50 unidades)</option>
                <option value="pro">PRO (até 500 unidades)</option>
                <option value="enterprise">ENTERPRISE (ilimitado)</option>
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Nome do síndico"
                value={form.sindico_nome}
                onChange={(e) => setForm((p) => ({ ...p, sindico_nome: e.target.value }))}
                required
              />
              <TextField
                label="E-mail do síndico"
                type="email"
                value={form.sindico_email}
                onChange={(e) => setForm((p) => ({ ...p, sindico_email: e.target.value }))}
                required
              />
            </div>
            <Button
              type="submit"
              disabled={criar.isPending || !form.nome || !form.sindico_nome || !form.sindico_email}
              className="w-full"
            >
              {criar.isPending ? 'Criando...' : 'Criar condomínio e convidar síndico'}
            </Button>
          </form>
        )}

        {convite && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-brand-100">
            <p className="text-sm font-semibold text-gray-900">Condomínio "{convite.nome}" criado!</p>
            <p className="text-xs text-gray-500 mt-1">
              Convite do síndico (7 dias) — enviado por e-mail e disponível abaixo:
            </p>
            <p className="mt-2 break-all rounded-xl bg-gray-50 p-3 font-mono text-xs text-gray-800">
              {convite.token}
            </p>
            <button onClick={() => setConvite(null)} className="mt-2 text-xs font-semibold text-brand-600">
              Fechar
            </button>
          </div>
        )}

        {condominios?.map((c) => (
          <div key={c.id} className="bg-white rounded-2xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block font-semibold text-gray-900 truncate">{c.nome}</span>
                <span className="block text-xs text-gray-500">
                  {c.unidades} unidade(s){c.max_unidades ? ` de ${c.max_unidades}` : ''} · {c.moradores}{' '}
                  morador(es) · {c.ocorrencias_abertas} ocorrência(s) aberta(s)
                  {c.validade ? ` · licença até ${new Date(c.validade).toLocaleDateString('pt-BR')}` : ''}
                </span>
              </span>
              <Badge tone={c.ativo ? 'green' : 'red'}>{c.ativo ? c.plano : 'inativo'}</Badge>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold">
              <select
                value={c.plano}
                onChange={(e) => atualizar.mutate({ id: c.id, payload: { plano: e.target.value } })}
                className="rounded-xl border border-gray-200 px-2 py-1 text-xs"
              >
                <option value="start">START</option>
                <option value="pro">PRO</option>
                <option value="enterprise">ENTERPRISE</option>
              </select>
              <button
                onClick={() => atualizar.mutate({ id: c.id, payload: { ativo: !c.ativo } })}
                disabled={atualizar.isPending}
                className="text-brand-600 disabled:opacity-50"
              >
                {c.ativo ? 'Desativar' : 'Reativar'}
              </button>
              <button
                onClick={() => baixarEdgeConfig(c.id, c.nome)}
                className="text-gray-600"
                title="Baixa o edge.config.json pronto — só colocar na pasta de instalação do Edge"
              >
                ⬇ Config. Edge
              </button>
            </div>
          </div>
        ))}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
