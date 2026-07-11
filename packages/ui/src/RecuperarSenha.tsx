import { useState } from 'react'
import { TextField, Button, Logo } from './components'
import client from './client'

/**
 * Página compartilhada de recuperação de senha / aceite de convite.
 * Passo 1: pede o e-mail (gera o código, enviado por e-mail ou informado
 * pelo síndico). Passo 2: código + nova senha.
 */
export function RecuperarSenha({ onVoltar, convite = false }: { onVoltar: () => void; convite?: boolean }) {
  const tenantId = ((import.meta as any).env?.VITE_TENANT_ID as string) ?? ''
  const [passo, setPasso] = useState<'pedir' | 'redefinir'>(convite ? 'redefinir' : 'pedir')
  const [form, setForm] = useState({ email: '', tenant_id: tenantId, token: '', senha: '' })
  const [msg, setMsg] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const pedir = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErro(null)
    try {
      await client.post('/auth/esqueci-senha', { email: form.email, tenant_id: form.tenant_id })
      setMsg('Se a conta existir, você receberá um código por e-mail. Informe-o abaixo.')
      setPasso('redefinir')
    } catch (err: any) {
      setErro(err.response?.data?.erro?.mensagem ?? 'Falha ao solicitar')
    } finally {
      setLoading(false)
    }
  }

  const redefinir = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setErro(null)
    try {
      await client.post(convite ? '/auth/aceitar-convite' : '/auth/redefinir-senha', {
        tenant_id: form.tenant_id,
        token: form.token,
        senha: form.senha,
      })
      setMsg(convite ? 'Conta ativada! Faça login com a nova senha.' : 'Senha redefinida! Faça login.')
      setTimeout(onVoltar, 1500)
    } catch (err: any) {
      setErro(err.response?.data?.erro?.mensagem ?? 'Código inválido ou expirado')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-areia flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        <div className="flex justify-center mb-6 [&_span]:!text-gray-900">
          <Logo />
        </div>
        <div className="bg-white rounded-2xl shadow-sm p-6 space-y-4">
          <h1 className="text-lg font-bold text-gray-900">
            {convite ? 'Ativar minha conta' : 'Recuperar senha'}
          </h1>
          {msg && <p className="text-sm text-green-700 bg-green-50 p-3 rounded-xl">{msg}</p>}
          {erro && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{erro}</p>}

          {passo === 'pedir' ? (
            <form onSubmit={pedir} className="space-y-3">
              <TextField
                label="E-mail"
                type="email"
                value={form.email}
                onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                required
              />
              <Button type="submit" disabled={loading || !form.email} className="w-full">
                {loading ? 'Enviando...' : 'Enviar código'}
              </Button>
              <button type="button" onClick={() => setPasso('redefinir')} className="w-full text-sm text-gray-500">
                Já tenho um código
              </button>
            </form>
          ) : (
            <form onSubmit={redefinir} className="space-y-3">
              <TextField
                label={convite ? 'Código do convite' : 'Código recebido'}
                value={form.token}
                onChange={(e) => setForm((p) => ({ ...p, token: e.target.value }))}
                required
              />
              <TextField
                label="Nova senha"
                type="password"
                value={form.senha}
                onChange={(e) => setForm((p) => ({ ...p, senha: e.target.value }))}
                required
              />
              <Button type="submit" disabled={loading || !form.token || form.senha.length < 6} className="w-full">
                {loading ? 'Salvando...' : convite ? 'Ativar conta' : 'Redefinir senha'}
              </Button>
            </form>
          )}

          <button onClick={onVoltar} className="w-full text-sm text-brand-600 font-semibold">
            ← Voltar ao login
          </button>
        </div>
      </div>
    </div>
  )
}
