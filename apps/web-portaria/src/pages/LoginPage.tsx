import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  // Porteiros nem sempre têm e-mail: entram com CPF + código do condomínio
  // (o código fica salvo no computador da guarita após o primeiro login).
  const [form, setForm] = useState({
    identificador: '',
    senha: '',
    codigo_condominio: localStorage.getItem('codigoCondominio') ?? '',
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
      await login({
        identificador: form.identificador,
        senha: form.senha,
        codigo_condominio: form.codigo_condominio.trim().toUpperCase(),
      })
      localStorage.setItem('codigoCondominio', form.codigo_condominio.trim().toUpperCase())
      navigate('/portaria')
    } catch (err: any) {
      setError(err.response?.data?.erro?.mensagem ?? 'Erro ao fazer login')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-grid h-14 w-14 place-items-center rounded-2xl bg-white/15 mb-3">
            <span className="text-3xl font-bold text-white">c</span>
          </div>
          <h1 className="text-3xl font-bold text-white lowercase tracking-tight">condar</h1>
          <p className="text-brand-50/80 mt-2">Controle de acesso condominial</p>
        </div>
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-6">Entrar na Portaria</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">CPF (ou e-mail do administrador)</label>
              <input
                name="identificador"
                value={form.identificador}
                onChange={handleChange}
                required
                placeholder="000.000.000-00"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Senha</label>
              <input
                type="password"
                name="senha"
                value={form.senha}
                onChange={handleChange}
                required
                autoComplete="current-password"
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">Código do condomínio</label>
              <input
                name="codigo_condominio"
                value={form.codigo_condominio}
                onChange={handleChange}
                required
                placeholder="Ex.: A1B2C3"
                maxLength={12}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono uppercase focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              />
            </div>
            {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-md">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50 transition-colors mt-2"
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigate('/recuperar')}
                className="text-sm text-gray-500 hover:text-brand-600"
              >
                Esqueci minha senha
              </button>
              <button
                type="button"
                onClick={() => navigate('/convite')}
                className="text-sm font-semibold text-brand-600 hover:text-brand-700"
              >
                Primeiro acesso
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}
