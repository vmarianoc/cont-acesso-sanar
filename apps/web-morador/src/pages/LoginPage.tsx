import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TextField, Button, ContasMultiplasError } from '@condar/ui'
import { useAuth } from '../hooks/useAuth'
import client from '../api/client'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm] = useState({ identificador: '', senha: '' })
  const [contas, setContas] = useState<{ tenant_id: string; condominio: string }[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }))

  const entrar = async (tenantId?: string) => {
    setLoading(true)
    setError(null)
    try {
      await login({ identificador: form.identificador, senha: form.senha, tenant_id: tenantId })
      localStorage.removeItem('unidadeId')
      try {
        const r = await client.post('/auth/contas', { identificador: form.identificador, senha: form.senha })
        localStorage.setItem('contas', JSON.stringify(r.data.data ?? []))
      } catch {
        localStorage.setItem('contas', '[]')
      }
      navigate('/')
    } catch (err: any) {
      if (err instanceof ContasMultiplasError) {
        setContas(err.contas) // usuário mora em mais de um condomínio: escolher
      } else {
        setError(err.response?.data?.erro?.mensagem ?? 'Erro ao entrar')
      }
    } finally {
      setLoading(false)
    }
  }

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await entrar()
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
        <TextField label="E-mail ou CPF" name="identificador" value={form.identificador} onChange={onChange} required />
        <TextField label="Senha" name="senha" type="password" value={form.senha} onChange={onChange} required />
        {contas && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">Você tem conta em mais de um condomínio — escolha:</p>
            {contas.map((c) => (
              <button
                key={c.tenant_id}
                type="button"
                onClick={() => entrar(c.tenant_id)}
                className="w-full text-left bg-gray-50 hover:bg-brand-50 rounded-xl px-4 py-3 text-sm font-semibold text-gray-800"
              >
                🏢 {c.condominio}
              </button>
            ))}
          </div>
        )}
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        <Button type="submit" disabled={loading} className="w-full">
          {loading ? 'Entrando...' : 'Entrar'}
        </Button>
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
            onClick={() => navigate('/registro')}
            className="text-sm font-semibold text-brand-600 hover:text-brand-700"
          >
            Primeiro acesso
          </button>
        </div>
      </form>
    </div>
  )
}
