import { useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Button, TextField, Badge, IconTile } from '@condar/ui'
import {
  fetchDocumentos,
  publicarDocumento,
  removerDocumento,
  fetchGrupos,
  criarGrupo,
  adicionarMembro,
  removerMembro,
  fetchPessoas,
} from '../api/sindico'
import client from '../api/client'
import BottomNav from '../components/BottomNav'

const fmtKb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.ceil(n / 1024)} KB`)

export default function DocumentosPage() {
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const [mostrarForm, setMostrarForm] = useState(false)
  const [mostrarGrupos, setMostrarGrupos] = useState(false)
  const [form, setForm] = useState({ titulo: '', escopo: 'todos', grupo_id: '' })
  const [novoGrupo, setNovoGrupo] = useState('')
  const [buscaPessoa, setBuscaPessoa] = useState('')
  const [grupoSel, setGrupoSel] = useState('')
  const [error, setError] = useState<string | null>(null)

  const { data: documentos } = useQuery({ queryKey: ['documentos'], queryFn: fetchDocumentos })
  const { data: grupos } = useQuery({ queryKey: ['grupos'], queryFn: fetchGrupos })
  const { data: pessoas } = useQuery({
    queryKey: ['pessoas', buscaPessoa],
    queryFn: () => fetchPessoas(buscaPessoa || undefined),
    enabled: mostrarGrupos,
  })

  const invalidar = () => {
    qc.invalidateQueries({ queryKey: ['documentos'] })
    qc.invalidateQueries({ queryKey: ['grupos'] })
  }

  const publicar = useMutation({
    mutationFn: async () => {
      const file = fileRef.current?.files?.[0]
      if (!file) throw new Error('Selecione um arquivo')
      const fd = new FormData()
      fd.append('titulo', form.titulo || file.name)
      fd.append('escopo', form.escopo)
      if (form.escopo === 'grupo') fd.append('grupo_id', form.grupo_id)
      fd.append('file', file)
      return publicarDocumento(fd)
    },
    onSuccess: () => {
      invalidar()
      setForm({ titulo: '', escopo: 'todos', grupo_id: '' })
      if (fileRef.current) fileRef.current.value = ''
      setMostrarForm(false)
      setError(null)
    },
    onError: (err: any) =>
      setError(err.response?.data?.erro?.mensagem ?? err.message ?? 'Falha ao publicar'),
  })

  const remover = useMutation({ mutationFn: removerDocumento, onSuccess: invalidar })

  const baixar = async (id: string, nome: string) => {
    const res = await client.get(`/documentos/${id}/download`, { responseType: 'blob' })
    const url = URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    a.click()
    URL.revokeObjectURL(url)
  }

  const addGrupo = useMutation({
    mutationFn: () => criarGrupo(novoGrupo),
    onSuccess: () => {
      invalidar()
      setNovoGrupo('')
    },
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao criar grupo'),
  })

  return (
    <AppScreen bottomNav>
      <Header
        variant="tinta"
        eyebrow="Convenção, atas e balancetes"
        title="Documentos"
        right={
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-xl"
          >
            {mostrarForm ? 'Fechar' : '+ Documento'}
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
              placeholder="Ex.: Convenção do condomínio"
              value={form.titulo}
              onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))}
            />
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Arquivo</span>
              <input ref={fileRef} type="file" required className="mt-1 block w-full text-sm" />
            </label>
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Visível para</span>
              <select
                value={form.escopo === 'todos' ? 'todos' : form.grupo_id}
                onChange={(e) => {
                  const v = e.target.value
                  setForm((p) =>
                    v === 'todos' ? { ...p, escopo: 'todos', grupo_id: '' } : { ...p, escopo: 'grupo', grupo_id: v }
                  )
                }}
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                <option value="todos">Todos os moradores</option>
                {grupos?.map((g) => (
                  <option key={g.id} value={g.id}>
                    Grupo: {g.nome}
                  </option>
                ))}
              </select>
            </label>
            <Button type="submit" disabled={publicar.isPending} className="w-full">
              {publicar.isPending ? 'Enviando...' : 'Publicar documento'}
            </Button>
          </form>
        )}

        <div className="flex items-center justify-between px-1">
          <h3 className="text-xs tracking-widest uppercase text-gray-400">Publicados</h3>
          <button onClick={() => setMostrarGrupos((v) => !v)} className="text-brand-600 font-semibold text-sm">
            {mostrarGrupos ? 'Fechar grupos' : 'Gerenciar grupos'}
          </button>
        </div>

        {mostrarGrupos && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
            <div className="flex gap-2">
              <input
                value={novoGrupo}
                onChange={(e) => setNovoGrupo(e.target.value)}
                placeholder="Novo grupo (ex.: conselho_fiscal)"
                className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
              <Button onClick={() => addGrupo.mutate()} disabled={!novoGrupo || addGrupo.isPending}>
                Criar
              </Button>
            </div>
            {grupos?.map((g) => (
              <div key={g.id} className="border-t border-gray-100 pt-3">
                <p className="font-semibold text-gray-900 text-sm">{g.nome}</p>
                <div className="mt-1 space-y-1">
                  {g.membros.map((m) => (
                    <div key={m.pessoa_id} className="flex items-center justify-between text-sm text-gray-700">
                      <span>{m.nome}</span>
                      <button
                        onClick={() => removerMembro(g.id, m.pessoa_id).then(invalidar)}
                        className="text-xs text-brand-600 font-semibold"
                      >
                        Remover
                      </button>
                    </div>
                  ))}
                  {g.membros.length === 0 && <p className="text-xs text-gray-400">Sem membros.</p>}
                </div>
                {grupoSel === g.id ? (
                  <div className="mt-2 space-y-2">
                    <TextField
                      label="Buscar pessoa"
                      placeholder="Nome"
                      value={buscaPessoa}
                      onChange={(e) => setBuscaPessoa(e.target.value)}
                    />
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {pessoas?.map((p) => (
                        <button
                          key={p.id}
                          onClick={() => adicionarMembro(g.id, p.id).then(invalidar)}
                          className="block w-full text-left text-sm text-gray-700 hover:text-brand-600"
                        >
                          + {p.nome}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setGrupoSel(g.id)} className="mt-2 text-xs text-brand-600 font-semibold">
                    + Adicionar membro
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {documentos?.map((d) => (
          <div key={d.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <IconTile icon="📄" />
            <span className="flex-1 min-w-0">
              <span className="block font-semibold text-gray-900 truncate">{d.titulo}</span>
              <span className="block text-xs text-gray-500">
                {d.arquivo_nome} · {fmtKb(d.tamanho)}
              </span>
            </span>
            <span className="flex flex-col items-end gap-1">
              <Badge tone={d.escopo === 'todos' ? 'green' : 'neutral'}>
                {d.escopo === 'todos' ? 'todos' : d.grupo_nome ?? 'grupo'}
              </Badge>
              <span className="flex gap-2 text-xs font-semibold">
                <button onClick={() => baixar(d.id, d.arquivo_nome)} className="text-gray-600">
                  Baixar
                </button>
                <button onClick={() => remover.mutate(d.id)} className="text-brand-600">
                  Remover
                </button>
              </span>
            </span>
          </div>
        ))}
        {documentos?.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm">
            Nenhum documento publicado.
          </div>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
