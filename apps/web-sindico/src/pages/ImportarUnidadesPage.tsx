import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppScreen, Header, Button, Stat, Badge } from '@condar/ui'
import BottomNav from '../components/BottomNav'
import {
  preVisualizarImportacao,
  confirmarImportacao,
  type ImportPreview,
  type ImportResultado,
} from '../api/importacao'

function mensagemErro(err: any): string {
  return err?.response?.data?.erro?.mensagem ?? 'Falha ao processar o arquivo'
}

export default function ImportarUnidadesPage() {
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [resultado, setResultado] = useState<ImportResultado | null>(null)
  const [loading, setLoading] = useState<'preview' | 'confirm' | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = () => {
    setPreview(null)
    setResultado(null)
    setError(null)
  }

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFile(e.target.files?.[0] ?? null)
    reset()
  }

  const handlePreview = async () => {
    if (!file) return
    setLoading('preview')
    setError(null)
    setResultado(null)
    try {
      setPreview(await preVisualizarImportacao(file))
    } catch (err) {
      setError(mensagemErro(err))
    } finally {
      setLoading(null)
    }
  }

  const handleConfirm = async () => {
    if (!file) return
    setLoading('confirm')
    setError(null)
    try {
      setResultado(await confirmarImportacao(file))
      setPreview(null)
    } catch (err) {
      setError(mensagemErro(err))
    } finally {
      setLoading(null)
    }
  }

  return (
    <AppScreen bottomNav>
      <Header
        variant="tinta"
        eyebrow="Gestão do condomínio"
        title="Importar unidades"
        right={
          <button onClick={() => navigate('/unidades')} className="text-white/70 hover:text-white text-sm">
            ← Voltar
          </button>
        }
      />

      <div className="px-5 mt-4 space-y-3">
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
          <div>
            <p className="font-semibold text-gray-900">
              Relatório do condomínio (PDF, CSV ou Excel)
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Envie o relatório "Contatos das unidades". A pré-visualização não grava nada — os
              dados só são salvos ao confirmar.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <input
              type="file"
              accept=".pdf,.csv,.xlsx,application/pdf,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={onFile}
              className="text-sm file:mr-3 file:rounded-xl file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-700 file:text-sm"
            />
            <Button onClick={handlePreview} disabled={!file || loading !== null}>
              {loading === 'preview' ? 'Lendo arquivo...' : 'Pré-visualizar'}
            </Button>
          </div>

          {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
        </div>

        {preview && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
            <div>
              <p className="font-semibold text-gray-900">Pré-visualização — {preview.condominio}</p>
              <p className="text-sm text-gray-500">Bloco: {preview.bloco}</p>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Unidades" value={preview.totais.unidades} />
              <Stat label="Ocupantes" value={preview.totais.ocupantes} />
              <Stat label="Com documento" value={preview.totais.comDocumento} />
              <Stat label="Pessoas jurídicas" value={preview.totais.juridicas} />
            </div>

            {!preview.licenca.cabe ? (
              <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded-xl">
                Esta importação excede o limite do plano{' '}
                <strong>{preview.licenca.plano.toUpperCase()}</strong> (
                {preview.licenca.limite_unidades} unidades). Atuais:{' '}
                {preview.licenca.unidades_atuais}, novas: {preview.licenca.novas_unidades}. Faça
                upgrade do plano para importar.
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 text-green-800 text-sm p-3 rounded-xl">
                Dentro do limite do plano {preview.licenca.plano.toUpperCase()} (
                {preview.licenca.novas_unidades} novas ·{' '}
                {preview.licenca.limite_unidades ?? '∞'} permitidas).
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500 border-b">
                    <th className="py-2 pr-3">Unidade</th>
                    <th className="py-2 pr-3">Ocupantes (amostra)</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.amostra.map((u) => (
                    <tr key={u.numero} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-3 font-mono">{u.numero}</td>
                      <td className="py-2 pr-3">
                        {u.ocupantes.map((o, i) => (
                          <div key={i} className="mb-1">
                            <span className="font-medium">{o.nome}</span>{' '}
                            <span className="text-gray-500">
                              · {o.tipo_vinculo}
                              {o.principal ? ' (principal)' : ''} ·{' '}
                              {o.tipo_pessoa === 'juridica' ? 'PJ' : 'PF'}
                              {o.cpf ? ` · ${o.cpf}` : ''}
                            </span>
                          </div>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-gray-400 mt-2">
                Mostrando {preview.amostra.length} de {preview.totais.unidades} unidades.
              </p>
            </div>

            <Button
              onClick={handleConfirm}
              disabled={loading !== null || !preview.licenca.cabe}
              title={!preview.licenca.cabe ? 'Excede o limite do plano' : undefined}
              className="w-full"
            >
              {loading === 'confirm' ? 'Importando...' : 'Confirmar importação'}
            </Button>
          </div>
        )}

        {resultado && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4">
            <p className="font-semibold text-green-700">
              Importação concluída — {resultado.condominio}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat label="Unidades criadas" value={resultado.resultado.unidades_criadas} />
              <Stat label="Já existentes" value={resultado.resultado.unidades_existentes} />
              <Stat label="Pessoas criadas" value={resultado.resultado.pessoas_criadas} />
              <Stat label="Vínculos criados" value={resultado.resultado.vinculos_criados} />
            </div>
            <Badge tone="green">concluído</Badge>
          </div>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
