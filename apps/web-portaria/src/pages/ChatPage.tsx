import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useRealtime } from '@condar/ui'
import client from '../api/client'

interface Conversa {
  unidade_id: string
  unidade_numero: string
  ultima_mensagem: string
  origem: string
  criado_em: string
}

interface Mensagem {
  id: string
  autor_nome: string
  origem: 'portaria' | 'morador'
  texto: string
  criado_em: string
}

interface UnidadeOption {
  id: string
  numero: string
  bloco: { nome: string }
}

const fmtHora = (s: string) =>
  new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export default function ChatPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [unidadeSel, setUnidadeSel] = useState<string>('')
  const [texto, setTexto] = useState('')
  const fimRef = useRef<HTMLDivElement>(null)

  useRealtime((ev) => {
    if (ev.tipo === 'chat_mensagem') {
      qc.invalidateQueries({ queryKey: ['chat'] })
    }
  })

  const { data: conversas } = useQuery({
    queryKey: ['chat', 'conversas'],
    queryFn: () => client.get('/chat/conversas').then((r) => r.data.data as Conversa[]),
  })
  const { data: unidades } = useQuery({
    queryKey: ['unidades', 'options'],
    queryFn: () => client.get('/unidades?limit=500').then((r) => r.data.data as UnidadeOption[]),
  })
  const { data: mensagens } = useQuery({
    queryKey: ['chat', unidadeSel],
    queryFn: () => client.get(`/chat/${unidadeSel}/mensagens`).then((r) => r.data.data as Mensagem[]),
    enabled: Boolean(unidadeSel),
  })

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens?.length])

  const enviar = useMutation({
    mutationFn: () => client.post(`/chat/${unidadeSel}/mensagens`, { texto }),
    onSuccess: () => {
      setTexto('')
      qc.invalidateQueries({ queryKey: ['chat'] })
    },
  })

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        <button
          onClick={() => navigate('/portaria')}
          className="text-gray-500 hover:text-gray-700 text-sm transition-colors mb-4"
        >
          ← Voltar à Portaria
        </button>

        <div className="grid grid-cols-1 sm:grid-cols-[220px_1fr] gap-4">
          <div className="bg-white rounded-xl shadow-sm p-3 space-y-1">
            <select
              value={unidadeSel}
              onChange={(e) => setUnidadeSel(e.target.value)}
              className="w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm mb-2"
            >
              <option value="">Nova conversa…</option>
              {unidades?.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.bloco.nome} · {u.numero}
                </option>
              ))}
            </select>
            {conversas?.map((c) => (
              <button
                key={c.unidade_id}
                onClick={() => setUnidadeSel(c.unidade_id)}
                className={`block w-full rounded-lg px-2 py-2 text-left text-sm ${
                  unidadeSel === c.unidade_id ? 'bg-brand-50 text-brand-700 font-semibold' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="block font-medium">Unidade {c.unidade_numero}</span>
                <span className="block truncate text-xs text-gray-500">{c.ultima_mensagem}</span>
              </button>
            ))}
            {conversas?.length === 0 && <p className="text-xs text-gray-400 px-2">Sem conversas ainda.</p>}
          </div>

          <div className="bg-white rounded-xl shadow-sm flex flex-col h-[70vh]">
            {unidadeSel ? (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {mensagens?.map((m) => (
                    <div key={m.id} className={`flex ${m.origem === 'portaria' ? 'justify-end' : 'justify-start'}`}>
                      <div
                        className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                          m.origem === 'portaria' ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        <p className="text-[10px] opacity-70">{m.autor_nome} · {fmtHora(m.criado_em)}</p>
                        <p>{m.texto}</p>
                      </div>
                    </div>
                  ))}
                  <div ref={fimRef} />
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault()
                    if (texto.trim()) enviar.mutate()
                  }}
                  className="border-t border-gray-100 p-3 flex gap-2"
                >
                  <input
                    value={texto}
                    onChange={(e) => setTexto(e.target.value)}
                    placeholder="Mensagem para o morador…"
                    className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
                  />
                  <button
                    type="submit"
                    disabled={enviar.isPending || !texto.trim()}
                    className="rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50"
                  >
                    Enviar
                  </button>
                </form>
              </>
            ) : (
              <p className="m-auto text-sm text-gray-400">Selecione uma unidade para conversar.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
