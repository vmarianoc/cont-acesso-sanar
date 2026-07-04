import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Button, TextField, Badge, iniciais } from '@condar/ui'
import {
  fetchUsuarios,
  fetchPessoasSemUsuario,
  criarUsuario,
  atualizarUsuario,
  gerarConvite,
  type Usuario,
} from '../api/sindico'
import BottomNav from '../components/BottomNav'

const PERFIS = [
  { value: 'morador', label: 'Morador' },
  { value: 'porteiro', label: 'Porteiro' },
  { value: 'sindico', label: 'Síndico' },
  { value: 'admin', label: 'Administrador' },
] as const

const FORM_INICIAL = { email: '', senha: '', perfil: 'morador' as const, pessoa_id: '' }

export default function UsuariosPage() {
  const qc = useQueryClient()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState<{
    email: string
    senha: string
    perfil: (typeof PERFIS)[number]['value']
    pessoa_id: string
  }>(FORM_INICIAL)
  const [error, setError] = useState<string | null>(null)

  const { data: usuarios } = useQuery({ queryKey: ['usuarios'], queryFn: fetchUsuarios })
  const { data: pessoas } = useQuery({
    queryKey: ['pessoas-sem-usuario'],
    queryFn: () => fetchPessoasSemUsuario(),
    enabled: mostrarForm,
  })

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['usuarios'] })
    qc.invalidateQueries({ queryKey: ['pessoas-sem-usuario'] })
  }

  const criar = useMutation({
    mutationFn: criarUsuario,
    onSuccess: () => {
      invalidar()
      setForm(FORM_INICIAL)
      setMostrarForm(false)
      setError(null)
    },
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao criar usuário'),
  })

  const alternarAtivo = useMutation({
    mutationFn: (u: Usuario) => atualizarUsuario(u.id, { ativo: !u.ativo }),
    onSuccess: invalidar,
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao atualizar'),
  })

  const [conviteDe, setConviteDe] = useState<{ email: string; token: string } | null>(null)
  const convidar = useMutation({
    mutationFn: (u: Usuario) => gerarConvite(u.id).then((r) => ({ email: u.email, token: r.token })),
    onSuccess: setConviteDe,
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao gerar convite'),
  })

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    criar.mutate({
      email: form.email,
      senha: form.senha,
      perfil: form.perfil,
      ...(form.pessoa_id ? { pessoa_id: form.pessoa_id } : {}),
    })
  }

  return (
    <AppScreen bottomNav>
      <Header
        variant="tinta"
        eyebrow="Gestão do condomínio"
        title="Usuários"
        right={
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-xl"
          >
            {mostrarForm ? 'Fechar' : '+ Convidar'}
          </button>
        }
      />

      <div className="px-5 mt-4 space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}

        {mostrarForm && (
          <form onSubmit={onSubmit} className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <p className="font-semibold text-gray-900">Novo usuário</p>
            <TextField
              label="E-mail"
              type="email"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              required
            />
            <TextField
              label="Senha inicial"
              type="text"
              value={form.senha}
              onChange={(e) => setForm((p) => ({ ...p, senha: e.target.value }))}
              required
            />
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Perfil</span>
              <select
                value={form.perfil}
                onChange={(e) => setForm((p) => ({ ...p, perfil: e.target.value as any }))}
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {PERFIS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Vincular a uma pessoa (opcional)</span>
              <select
                value={form.pessoa_id}
                onChange={(e) => setForm((p) => ({ ...p, pessoa_id: e.target.value }))}
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="">— Sem vínculo —</option>
                {pessoas?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome} ({p.tipo})
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={criar.isPending} className="w-full">
              {criar.isPending ? 'Criando...' : 'Criar usuário'}
            </Button>
          </form>
        )}

        {usuarios?.map((u) => (
          <div key={u.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-50 text-sm font-bold text-brand-600">
              {iniciais(u.pessoa_nome ?? u.email)}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-gray-900 truncate">
                {u.pessoa_nome ?? u.email}
              </span>
              <span className="block text-xs text-gray-500 truncate">
                {u.email} · {u.perfil}
                {u.mfa_ativo ? ' · MFA' : ''}
              </span>
            </span>
            <Badge tone={u.ativo ? 'green' : 'red'}>{u.ativo ? 'ativo' : 'inativo'}</Badge>
            <span className="flex flex-col items-end gap-1 text-xs font-semibold">
              <button
                onClick={() => alternarAtivo.mutate(u)}
                disabled={alternarAtivo.isPending}
                className="text-brand-600 disabled:opacity-50"
              >
                {u.ativo ? 'Desativar' : 'Ativar'}
              </button>
              <button
                onClick={() => convidar.mutate(u)}
                disabled={convidar.isPending}
                className="text-gray-500 disabled:opacity-50"
              >
                Convite
              </button>
            </span>
          </div>
        ))}

        {conviteDe && (
          <div className="bg-white rounded-2xl p-4 shadow-sm border border-brand-100">
            <p className="text-sm font-semibold text-gray-900">Convite gerado para {conviteDe.email}</p>
            <p className="text-xs text-gray-500 mt-1">
              Envie o código abaixo (válido por 7 dias). O morador ativa a conta em “Esqueci minha
              senha → Já tenho um código” ou na tela de convite do app.
            </p>
            <p className="mt-2 break-all rounded-xl bg-gray-50 p-3 font-mono text-xs text-gray-800">
              {conviteDe.token}
            </p>
            <button onClick={() => setConviteDe(null)} className="mt-2 text-xs font-semibold text-brand-600">
              Fechar
            </button>
          </div>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
