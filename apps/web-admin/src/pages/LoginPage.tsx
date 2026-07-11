import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TextField, Button, ContasMultiplasError } from '@condar/ui'
import { useAuth } from '../hooks/useAuth'

export default function LoginPage() {
  const navigate = useNavigate()
  const { login } = useAuth()
  const [form, setForm] = useState({ identificador: '', senha: '', mfa_code: '' })
  const [contas, setContas] = useState<{ tenant_id: string; condominio: string }[] | null>(null)
  const [tenantEscolhido, setTenantEscolhido] = useState<string | undefined>()
  const [precisaMfa, setPrecisaMfa] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const onChange = (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((p) => ({ ...p, [e.target.name]: e.target.value }))

  const entrar = async (tenantId?: string) => {
    setLoading(true)
    setError(null)
    try {
      await login({
        identificador: form.identificador,
        senha: form.senha,
        tenant_id: tenantId ?? tenantEscolhido,
        ...(form.mfa_code ? { mfa_code: form.mfa_code } : {}),
      })
      navigate('/')
    } catch (err: any) {
      if (err instanceof ContasMultiplasError) {
        setContas(err.contas)
        return
      }
      const codigo = err.response?.data?.erro?.codigo
      if (codigo === 'MFA_REQUERIDO') {
        setPrecisaMfa(true)
        setError('Informe o código MFA do seu app autenticador.')
      } else {
        setError(err.response?.data?.erro?.mensagem ?? 'Erro ao entrar')
      }
    } finally {
      setLoading(false)
    }
  }

  const escolherConta = async (tenantId: string) => {
    setTenantEscolhido(tenantId)
    setContas(null)
    await entrar(tenantId)
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
        <p className="text-white/80 mt-1">Gestão do síndico</p>
      </div>

      <form onSubmit={onSubmit} className="bg-white rounded-3xl p-6 shadow-xl space-y-4">
        <TextField label="E-mail ou CPF" name="identificador" value={form.identificador} onChange={onChange} required />
        <TextField label="Senha" name="senha" type="password" value={form.senha} onChange={onChange} required />
        {contas && (
          <div className="space-y-2">
            <p className="text-sm text-gray-600">Escolha o condomínio:</p>
            {contas.map((c) => (
              <button key={c.tenant_id} type="button" onClick={() => escolherConta(c.tenant_id)}
                className="w-full text-left bg-gray-50 hover:bg-brand-50 rounded-xl px-4 py-3 text-sm font-semibold text-gray-800">
                🏢 {c.condominio}
              </button>
            ))}
          </div>
        )}
        {precisaMfa && (
          <TextField label="Código MFA" name="mfa_code" value={form.mfa_code} onChange={onChange} mono />
        )}
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
