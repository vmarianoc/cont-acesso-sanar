import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import client from '../api/client'

interface VisitorFormProps {
  onSuccess?: () => void
}

interface UnidadeOption {
  id: string
  numero: string
  bloco: { nome: string }
}

export default function VisitorForm({ onSuccess }: VisitorFormProps) {
  const { data: unidades } = useQuery({
    queryKey: ['unidades', 'options'],
    queryFn: () =>
      client.get('/unidades?limit=500').then((r) => r.data.data as UnidadeOption[]),
  })
  const [form, setForm] = useState({
    nome: '',
    documento: '',
    unidade_id: '',
    valido_de: '',
    valido_ate: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await client.post('/morador/visitantes/pre-autorizar', {
        ...form,
        valido_de: new Date(form.valido_de).toISOString(),
        valido_ate: new Date(form.valido_ate).toISOString(),
      })
      setForm({ nome: '', documento: '', unidade_id: '', valido_de: '', valido_ate: '' })
      onSuccess?.()
    } catch (err: any) {
      setError(err.response?.data?.erro?.mensagem ?? 'Erro ao cadastrar visitante')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-gray-700">Nome do visitante</label>
        <input
          name="nome"
          value={form.nome}
          onChange={handleChange}
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Documento (RG/CPF)</label>
        <input
          name="documento"
          value={form.documento}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        />
      </div>
      <div>
        <label className="block text-sm font-medium text-gray-700">Unidade</label>
        <select
          name="unidade_id"
          value={form.unidade_id}
          onChange={(e) => setForm((prev) => ({ ...prev, unidade_id: e.target.value }))}
          required
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
        >
          <option value="">— Selecione a unidade —</option>
          {unidades?.map((u) => (
            <option key={u.id} value={u.id}>
              {u.bloco.nome} · {u.numero}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700">Válido de</label>
          <input
            type="datetime-local"
            name="valido_de"
            value={form.valido_de}
            onChange={handleChange}
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700">Válido até</label>
          <input
            type="datetime-local"
            name="valido_ate"
            value={form.valido_ate}
            onChange={handleChange}
            required
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
          />
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
      >
        {loading ? 'Cadastrando...' : 'Pré-autorizar visitante'}
      </button>
    </form>
  )
}
