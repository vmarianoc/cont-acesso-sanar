import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm] = useState({
    email: '',
    senha: '',
    tenant_id: import.meta.env.VITE_TENANT_ID ?? '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }))

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      await login(form)
      navigate('/')
    } catch (err: any) {
      setError(err.response?.data?.erro?.mensagem ?? 'Erro ao entrar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-600 flex flex-col justify-center px-6">
      <div className="text-center mb-8">
        <div className="inline-grid h-16 w-16 place-items-center rounded-2xl bg-white/15 mb-3">
          <span className="text-4xl font-bold text-white">c</span>
        </div>
        <h1 className="text-3xl font-bold text-white lowercase tracking-tight">condar</h1>
        <p className="text-white/80 mt-1">Seu condomínio no bolso</p>
      </div>

      <form onSubmit={onSubmit} className="bg-white rounded-3xl p-6 shadow-xl space-y-4">
        <Input label="E-mail" name="email" type="email" value={form.email} onChange={onChange} />
        <Input label="Senha" name="senha" type="password" value={form.senha} onChange={onChange} />
        <Input
          label="ID do condomínio"
          name="tenant_id"
          value={form.tenant_id}
          onChange={onChange}
          mono
        />
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-brand-600 px-4 py-3 font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {loading ? 'Entrando...' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}

function Input({
  label,
  mono,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; mono?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-gray-700">{label}</span>
      <input
        {...props}
        required
        className={`mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 ${mono ? 'font-mono' : ''}`}
      />
    </label>
  )
}
