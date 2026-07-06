import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TextField, Button } from '@condar/ui'
import { useAuth } from '../hooks/useAuth'
import client from '../api/client'

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
      localStorage.setItem('tenantId', form.tenant_id)
      localStorage.removeItem('unidadeId')
      try {
        const contas = await client.post('/auth/contas', { email: form.email, senha: form.senha })
        localStorage.setItem('contas', JSON.stringify(contas.data.data ?? []))
      } catch {
        localStorage.setItem('contas', '[]')
      }
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
        <TextField label="E-mail" name="email" type="email" value={form.email} onChange={onChange} required />
        <TextField label="Senha" name="senha" type="password" value={form.senha} onChange={onChange} required />
        <TextField label="ID do condomínio" name="tenant_id" value={form.tenant_id} onChange={onChange} mono required />
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Entrando...' : 'Entrar'}
        </Button>
        <button
          type="button"
          onClick={() => navigate('/recuperar')}
          className="w-full text-sm text-gray-500 hover:text-brand-600"
        >
          Esqueci minha senha
        </button>
      </form>
    </div>
  )
}
