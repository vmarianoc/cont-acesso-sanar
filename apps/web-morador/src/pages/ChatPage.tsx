import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, useRealtime } from '@condar/ui'
import { fetchContextos } from '../api/morador'
import client from '../api/client'
import BottomNav from '../components/BottomNav'

interface Mensagem {
  id: string
  autor_nome: string
  origem: 'portaria' | 'morador'
  texto: string
  criado_em: string
}

const fmtHora = (s: string) =>
  new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export default function ChatPage() {
  const qc = useQueryClient()
  const [texto, setTexto] = useState('')
  const fimRef = useRef<HTMLDivElement>(null)

  const { data: contextos } = useQuery({ queryKey: ['contextos'], queryFn: fetchContextos })
  const unidadeId = localStorage.getItem('unidadeId') ?? contextos?.find((c) => c.principal)?.unidade_id ?? contextos?.[0]?.unidade_id

  useRealtime((ev) => {
    if (ev.tipo === 'chat_mensagem') qc.invalidateQueries({ queryKey: ['chat'] })
  })

  const { data: mensagens } = useQuery({
    queryKey: ['chat', unidadeId],
    queryFn: () => client.get(`/chat/${unidadeId}/mensagens`).then((r) => r.data.data as Mensagem[]),
    enabled: Boolean(unidadeId),
  })

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [mensagens?.length])

  const enviar = useMutation({
    mutationFn: () => client.post(`/chat/${unidadeId}/mensagens`, { texto }),
    onSuccess: () => {
      setTexto('')
      qc.invalidateQueries({ queryKey: ['chat'] })
    },
  })

  return (
    <AppScreen bottomNav>
      <Header variant="tinta" eyebrow="Fale com a portaria" title="Chat" />

      <div className="px-5 mt-4 flex flex-col" style={{ minHeight: '60vh' }}>
        <div className="flex-1 space-y-2 pb-4">
          {mensagens?.map((m) => (
            <div key={m.id} className={`flex ${m.origem === 'morador' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-sm ${
                  m.origem === 'morador' ? 'bg-brand-600 text-white' : 'bg-white text-gray-800'
                }`}
              >
                <p className="text-[10px] opacity-70">
                  {m.origem === 'portaria' ? 'Portaria' : m.autor_nome} · {fmtHora(m.criado_em)}
                </p>
                <p>{m.texto}</p>
              </div>
            </div>
          ))}
          {mensagens?.length === 0 && (
            <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm">
              Envie a primeira mensagem para a portaria.
            </div>
          )}
          <div ref={fimRef} />
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (texto.trim() && unidadeId) enviar.mutate()
          }}
          className="sticky bottom-20 flex gap-2 bg-areia pb-2"
        >
          <input
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Mensagem…"
            className="flex-1 rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
          <button
            type="submit"
            disabled={enviar.isPending || !texto.trim()}
            className="rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            ➤
          </button>
        </form>
      </div>

      <BottomNav />
    </AppScreen>
  )
}
