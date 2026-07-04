import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import client from '../api/client'

interface UnidadeOption {
  id: string
  numero: string
  bloco: { nome: string }
}

export default function OcorrenciaPage() {
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [form, setForm] = useState({ titulo: '', descricao: '', categoria: 'outros', unidade_id: '' })
  const [msg, setMsg] = useState<string | null>(null)

  const { data: unidades } = useQuery({
    queryKey: ['unidades', 'options'],
    queryFn: () => client.get('/unidades?limit=500').then((r) => r.data.data as UnidadeOption[]),
  })

  const abrir = useMutation({
    mutationFn: () =>
      client.post('/ocorrencias', { ...form, unidade_id: form.unidade_id || undefined }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['ocorrencias'] })
      setForm({ titulo: '', descricao: '', categoria: 'outros', unidade_id: '' })
      setMsg('Ocorrência registrada no livro digital.')
    },
  })

  const inputCls =
    'mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500'

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-lg mx-auto">
        <button
          onClick={() => navigate('/portaria')}
          className="text-gray-500 hover:text-gray-700 text-sm transition-colors mb-6"
        >
          ← Voltar à Portaria
        </button>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Registrar Ocorrência</h1>
          <p className="text-sm text-gray-500 mb-6">O síndico é avisado em tempo real.</p>
          {msg && <p className="text-sm text-green-700 bg-green-50 p-3 rounded-md mb-4">{msg}</p>}
          <form
            onSubmit={(e) => {
              e.preventDefault()
              abrir.mutate()
            }}
            className="space-y-4"
          >
            <div>
              <label className="block text-sm font-medium text-gray-700">Título</label>
              <input value={form.titulo} onChange={(e) => setForm((p) => ({ ...p, titulo: e.target.value }))} required className={inputCls} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Descrição</label>
              <textarea value={form.descricao} onChange={(e) => setForm((p) => ({ ...p, descricao: e.target.value }))} required rows={3} className={inputCls} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Categoria</label>
                <select value={form.categoria} onChange={(e) => setForm((p) => ({ ...p, categoria: e.target.value }))} className={inputCls}>
                  <option value="barulho">Barulho</option>
                  <option value="manutencao">Manutenção</option>
                  <option value="seguranca">Segurança</option>
                  <option value="outros">Outros</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Unidade (opcional)</label>
                <select value={form.unidade_id} onChange={(e) => setForm((p) => ({ ...p, unidade_id: e.target.value }))} className={inputCls}>
                  <option value="">—</option>
                  {unidades?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.bloco.nome} · {u.numero}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <button
              type="submit"
              disabled={abrir.isPending || !form.titulo || !form.descricao}
              className="w-full rounded-md bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700 disabled:opacity-50 transition-colors"
            >
              {abrir.isPending ? 'Registrando...' : 'Registrar ocorrência'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
