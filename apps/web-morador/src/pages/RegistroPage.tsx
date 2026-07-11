import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { TextField, Button } from '@condar/ui'
import client from '../api/client'

/**
 * Primeiro acesso do morador (implantação): quem recebeu o código do síndico
 * confirma e cria a senha; quem não está na lista solicita o cadastro.
 */
export default function RegistroPage() {
  const navigate = useNavigate()
  const [modo, setModo] = useState<'codigo' | 'solicitar'>('codigo')
  const [form, setForm] = useState({ identificador: '', codigo: '', senha: '' })
  const [sol, setSol] = useState({ tenant_id: '', nome: '', email: '', cpf: '', telefone: '', unidade: '' })
  const [condominios, setCondominios] = useState<{ tenant_id: string; nome: string }[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    client.get('/auth/condominios').then((r) => setCondominios(r.data.data ?? [])).catch(() => {})
  }, [])

  const confirmar = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const r = await client.post('/auth/registro/confirmar', {
        identificador: form.identificador,
        codigo: form.codigo,
        senha: form.senha,
      })
      const d = r.data.data
      localStorage.setItem('token', d.token)
      localStorage.setItem('perfil', d.perfil)
      if (d.tenant_id) localStorage.setItem('tenantId', d.tenant_id)
      navigate('/')
    } catch (err: any) {
      const codigo = err.response?.data?.erro?.codigo
      if (codigo === 'NAO_ENCONTRADO') {
        setModo('solicitar')
        setSol((p) => ({ ...p, email: form.identificador.includes('@') ? form.identificador : '', cpf: form.identificador.includes('@') ? '' : form.identificador }))
        setError('Não achamos seu e-mail/CPF na lista — solicite seu cadastro abaixo.')
      } else {
        setError(err.response?.data?.erro?.mensagem ?? 'Erro ao confirmar cadastro')
      }
    } finally {
      setLoading(false)
    }
  }

  const solicitar = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)
    try {
      const r = await client.post('/auth/registro/solicitar', {
        tenant_id: sol.tenant_id,
        nome: sol.nome,
        email: sol.email,
        cpf: sol.cpf || undefined,
        telefone: sol.telefone || undefined,
        unidade: sol.unidade || undefined,
      })
      setMsg(r.data.data.mensagem)
    } catch (err: any) {
      setError(err.response?.data?.erro?.mensagem ?? 'Erro ao enviar solicitação')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-brand-600 flex flex-col justify-center px-6 py-10">
      <div className="text-center mb-6">
        <h1 className="text-3xl font-bold text-white lowercase tracking-tight">condar</h1>
        <p className="text-white/80 mt-1">Primeiro acesso</p>
      </div>

      {msg ? (
        <div className="bg-white rounded-3xl p-6 shadow-xl text-center space-y-4">
          <p className="text-4xl">✅</p>
          <p className="text-gray-800">{msg}</p>
          <Button className="w-full" onClick={() => navigate('/login')}>Voltar ao login</Button>
        </div>
      ) : modo === 'codigo' ? (
        <form onSubmit={confirmar} className="bg-white rounded-3xl p-6 shadow-xl space-y-4">
          <p className="text-sm text-gray-600">
            Use o código de cadastro que o condomínio enviou para o seu e-mail.
          </p>
          <TextField label="E-mail ou CPF" value={form.identificador}
            onChange={(e) => setForm((p) => ({ ...p, identificador: e.target.value }))} required />
          <TextField label="Código de cadastro (6 dígitos)" value={form.codigo} mono
            onChange={(e) => setForm((p) => ({ ...p, codigo: e.target.value.replace(/\D/g, '').slice(0, 6) }))} required />
          <TextField label="Crie sua senha (mín. 8)" type="password" value={form.senha}
            onChange={(e) => setForm((p) => ({ ...p, senha: e.target.value }))} required />
          {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Validando...' : 'Confirmar cadastro'}
          </Button>
          <button type="button" onClick={() => setModo('solicitar')}
            className="w-full text-sm text-gray-500 hover:text-brand-600">
            Não recebi código — solicitar cadastro
          </button>
          <button type="button" onClick={() => navigate('/login')}
            className="w-full text-sm text-gray-400">Voltar ao login</button>
        </form>
      ) : (
        <form onSubmit={solicitar} className="bg-white rounded-3xl p-6 shadow-xl space-y-3">
          <p className="text-sm text-gray-600">
            Preencha seus dados — o síndico do condomínio aprova e você recebe o convite por e-mail.
          </p>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">Condomínio</span>
            <select value={sol.tenant_id} required
              onChange={(e) => setSol((p) => ({ ...p, tenant_id: e.target.value }))}
              className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm">
              <option value="">Escolha…</option>
              {condominios.map((c) => (
                <option key={c.tenant_id} value={c.tenant_id}>{c.nome}</option>
              ))}
            </select>
          </label>
          <TextField label="Nome completo" value={sol.nome}
            onChange={(e) => setSol((p) => ({ ...p, nome: e.target.value }))} required />
          <TextField label="E-mail" type="email" value={sol.email}
            onChange={(e) => setSol((p) => ({ ...p, email: e.target.value }))} required />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="CPF" value={sol.cpf}
              onChange={(e) => setSol((p) => ({ ...p, cpf: e.target.value }))} />
            <TextField label="Unidade (ex.: 101)" value={sol.unidade}
              onChange={(e) => setSol((p) => ({ ...p, unidade: e.target.value }))} />
          </div>
          <TextField label="Telefone" value={sol.telefone}
            onChange={(e) => setSol((p) => ({ ...p, telefone: e.target.value }))} />
          {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading || !sol.tenant_id}>
            {loading ? 'Enviando...' : 'Solicitar cadastro'}
          </Button>
          <button type="button" onClick={() => setModo('codigo')}
            className="w-full text-sm text-gray-500">Tenho um código</button>
        </form>
      )}
    </div>
  )
}
