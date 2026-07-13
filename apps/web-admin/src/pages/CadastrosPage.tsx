import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Button, TextField, Badge, iniciais } from '@condar/ui'
import { fetchPessoas, criarPessoa, atualizarPessoa, enviarFotoPessoa } from '../api/admin'
import BottomNav from '../components/BottomNav'

const TIPOS = [
  { value: 'morador', label: 'Morador' },
  { value: 'funcionario', label: 'Funcionário' },
  { value: 'prestador', label: 'Prestador' },
] as const

export default function CadastrosPage() {
  const qc = useQueryClient()
  const [busca, setBusca] = useState('')
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ nome: '', cpf: '', tipo: 'morador' })
  const [error, setError] = useState<string | null>(null)

  const [fotoStatus, setFotoStatus] = useState<Record<string, 'enviando' | 'ok' | 'erro'>>({})
  const { data: pessoas } = useQuery({
    queryKey: ['pessoas', busca],
    queryFn: () => fetchPessoas(busca || undefined),
  })

  const criar = useMutation({
    mutationFn: () =>
      criarPessoa({ nome: form.nome, cpf: form.cpf || undefined, tipo: form.tipo }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['pessoas'] })
      setForm({ nome: '', cpf: '', tipo: 'morador' })
      setMostrarForm(false)
      setError(null)
    },
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao cadastrar'),
  })

  return (
    <AppScreen bottomNav wide>
      <Header
        variant="tinta"
        eyebrow="Administração"
        title="Cadastros"
        right={
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-xl"
          >
            {mostrarForm ? 'Fechar' : '+ Pessoa'}
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
              label="Nome completo"
              value={form.nome}
              onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
              required
            />
            <TextField
              label="CPF/CNPJ (opcional)"
              value={form.cpf}
              onChange={(e) => setForm((p) => ({ ...p, cpf: e.target.value }))}
            />
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Tipo</span>
              <select
                value={form.tipo}
                onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))}
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={criar.isPending || !form.nome} className="w-full">
              {criar.isPending ? 'Cadastrando...' : 'Cadastrar pessoa'}
            </Button>
          </form>
        )}

        <TextField
          label="Buscar pessoa"
          placeholder="Nome"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
        />

        {pessoas?.map((p) => (
          <div key={p.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
              {iniciais(p.nome)}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-gray-900 truncate">{p.nome}</span>
              <span className="block text-xs text-gray-500">
                {p.cpf ? `Doc. ${p.cpf}` : 'Sem documento'}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <Badge tone={p.tipo === 'morador' ? 'green' : 'neutral'}>{p.tipo}</Badge>
              <span className="flex gap-3">
                <label className="text-xs text-brand-600 font-semibold cursor-pointer">
                  📷 Foto
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="hidden"
                    onChange={(e) => {
                      const arquivo = e.target.files?.[0]
                      if (!arquivo) return
                      setFotoStatus((prev) => ({ ...prev, [p.id]: 'enviando' }))
                      enviarFotoPessoa(p.id, arquivo)
                        .then(() => setFotoStatus((prev) => ({ ...prev, [p.id]: 'ok' })))
                        .catch(() => setFotoStatus((prev) => ({ ...prev, [p.id]: 'erro' })))
                      e.target.value = ''
                    }}
                  />
                </label>
                <button
                  onClick={() =>
                    atualizarPessoa(p.id, { ativo: !(p as any).ativo }).then(() =>
                      qc.invalidateQueries({ queryKey: ['pessoas'] })
                    )
                  }
                  className="text-xs text-brand-600 font-semibold"
                >
                  {(p as any).ativo === false ? 'Reativar' : 'Desativar'}
                </button>
              </span>
              {fotoStatus[p.id] && (
                <span className={`text-[10px] ${fotoStatus[p.id] === 'erro' ? 'text-red-600' : 'text-gray-500'}`}>
                  {fotoStatus[p.id] === 'enviando' ? 'Enviando foto…' : fotoStatus[p.id] === 'ok' ? 'Foto sincronizada ✓' : 'Falha no envio'}
                </span>
              )}
            </span>
          </div>
        ))}
        {pessoas?.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm">
            Nenhuma pessoa encontrada.
          </div>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
