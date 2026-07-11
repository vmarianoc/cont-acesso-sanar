import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import VisitorForm from '../components/VisitorForm'


function ValidarConvite() {
  const [token, setToken] = useState('')
  const [resultado, setResultado] = useState<any | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const validar = async (e: React.FormEvent) => {
    e.preventDefault()
    setErro(null)
    try {
      const r = await client.post('/visitantes/validar-qr', { qr_token: token.trim() })
      setResultado(r.data.data)
    } catch (err: any) {
      setErro(err.response?.data?.erro?.mensagem ?? 'Falha ao validar')
    }
  }
  const registrarEntrada = async () => {
    if (!resultado?.visitante) return
    await client.post(`/visitantes/${resultado.visitante.id}/entrada`)
    setResultado(null)
    setToken('')
  }
  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
      <h3 className="font-semibold text-gray-900">Validar convite (QR)</h3>
      <form onSubmit={validar} className="flex gap-2">
        <input value={token} onChange={(e) => setToken(e.target.value)}
          placeholder="Escaneie ou digite o código V-…"
          className="flex-1 rounded-xl border border-gray-300 px-3 py-2 text-sm font-mono" />
        <button type="submit" className="rounded-xl bg-brand-600 text-white px-4 text-sm font-semibold">
          Validar
        </button>
      </form>
      {erro && <p className="text-sm text-red-600 bg-red-50 p-2 rounded-lg">{erro}</p>}
      {resultado && (
        <div className={`rounded-xl p-3 ${resultado.resultado === 'liberado' ? 'bg-green-50' : 'bg-red-50'}`}>
          <p className="font-bold">
            {resultado.resultado === 'liberado' ? '✅ Convite válido' : `⛔ ${resultado.motivo.replace(/_/g, ' ')}`}
          </p>
          {resultado.visitante && (
            <div className="text-sm text-gray-700 mt-1 space-y-0.5">
              <p><b>{resultado.visitante.nome}</b> {resultado.visitante.documento ? `· Doc. ${resultado.visitante.documento}` : ''}</p>
              <p>Liberado por: <b>{resultado.visitante.autorizado_por ?? '—'}</b>{resultado.visitante.unidade ? ` (AP ${resultado.visitante.unidade})` : ''}</p>
              <p className="text-xs text-gray-500">
                Janela: {new Date(resultado.visitante.valido_de).toLocaleString('pt-BR')} → {new Date(resultado.visitante.valido_ate).toLocaleString('pt-BR')}
              </p>
            </div>
          )}
          {resultado.resultado === 'liberado' && (
            <button onClick={registrarEntrada}
              className="mt-2 rounded-lg bg-brand-600 text-white px-3 py-1.5 text-sm font-semibold">
              Registrar entrada
            </button>
          )}
        </div>
      )}
    </div>
  )
}

export default function VisitantePage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/portaria')}
            className="text-gray-500 hover:text-gray-700 text-sm transition-colors"
          >
            ← Voltar à Portaria
          </button>
        </div>
        <div className="mb-4"><ValidarConvite /></div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Pré-autorizar Visitante</h1>
          <p className="text-sm text-gray-500 mb-6">
            Preencha os dados do visitante para gerar uma autorização de acesso.
          </p>
          <VisitorForm onSuccess={() => navigate('/portaria')} />
        </div>
      </div>
    </div>
  )
}
