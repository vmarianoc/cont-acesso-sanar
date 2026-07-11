import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../api/client'

interface Visitante {
  id: string
  nome: string
  documento: string | null
  unidade_numero: string | null
  valido_de: string
  valido_ate: string
  entrada_em: string | null
  saida_em: string | null
}

const fmtHora = (s: string) =>
  new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

export default function PresencaPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()

  const { data: visitantes } = useQuery({
    queryKey: ['visitantes'],
    queryFn: () => client.get('/visitantes').then((r) => r.data.data as Visitante[]),
    refetchInterval: 10000,
  })

  const marcar = useMutation({
    mutationFn: ({ id, acao }: { id: string; acao: 'entrada' | 'saida' }) =>
      client.post(`/visitantes/${id}/${acao}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['visitantes'] }),
  })

  const presentes = visitantes?.filter((v) => v.entrada_em && !v.saida_em) ?? []
  const esperados = visitantes?.filter((v) => !v.entrada_em) ?? []

  const Cartao = ({ v, acao }: { v: Visitante; acao: 'entrada' | 'saida' }) => (
    <div className="bg-white rounded-lg shadow-sm p-3 flex items-center justify-between gap-2">
      <span className="min-w-0">
        <span className="block text-sm font-medium text-gray-900 truncate">{v.nome}</span>
        <span className="block text-xs text-gray-500">
          {v.unidade_numero ? `Unidade ${v.unidade_numero} · ` : ''}
          {acao === 'saida' && v.entrada_em
            ? `entrou às ${fmtHora(v.entrada_em)}`
            : `janela ${fmtHora(v.valido_de)}–${fmtHora(v.valido_ate)}`}
        </span>
      </span>
      <button
        onClick={() => marcar.mutate({ id: v.id, acao })}
        disabled={marcar.isPending}
        className={`text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 ${
          acao === 'entrada' ? 'bg-green-600 hover:bg-green-700' : 'bg-gray-800 hover:bg-gray-900'
        }`}
      >
        {acao === 'entrada' ? 'Registrar entrada' : 'Registrar saída'}
      </button>
    </div>
  )

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => navigate('/portaria')}
          className="text-gray-500 hover:text-gray-700 text-sm transition-colors mb-6"
        >
          ← Voltar à Portaria
        </button>

        <h1 className="text-xl font-semibold text-gray-900 mb-1">
          Quem está dentro ({presentes.length})
        </h1>
        <p className="text-sm text-gray-500 mb-4">
          Lista viva para emergências e controle de presença.
        </p>
        <div className="space-y-2 mb-8">
          {presentes.map((v) => (
            <Cartao key={v.id} v={v} acao="saida" />
          ))}
          {presentes.length === 0 && <p className="text-sm text-gray-500">Nenhum visitante dentro agora.</p>}
        </div>

        <h2 className="text-sm font-semibold text-gray-800 mb-2">Visitantes esperados ({esperados.length})</h2>
        <div className="space-y-2">
          {esperados.map((v) => (
            <Cartao key={v.id} v={v} acao="entrada" />
          ))}
          {esperados.length === 0 && <p className="text-sm text-gray-500">Nenhum visitante esperado.</p>}
        </div>
      </div>
    </div>
  )
}
