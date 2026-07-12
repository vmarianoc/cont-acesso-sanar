import { useEffect, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import QRCode from 'qrcode'
import { Button, TextField } from '@condar/ui'
import client from '../api/client'

interface Convite {
  id: string
  nome: string
  documento: string | null
  valido_de: string
  valido_ate: string
  qr_token: string | null
  foto_base64: string | null
}

function arquivoParaBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve((reader.result as string).split(',')[1] ?? '')
    reader.onerror = reject
    reader.readAsDataURL(file)
  })
}

function QrCanvas({ token }: { token: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (ref.current) QRCode.toCanvas(ref.current, token, { width: 220, margin: 1 })
  }, [token])
  return <canvas ref={ref} className="mx-auto rounded-xl" />
}

/** Convite de visitante com QR — o visitante apresenta no leitor facial da portaria. */
export default function ConvidarVisitante() {
  const qc = useQueryClient()
  const [form, setForm] = useState({ nome: '', documento: '', horas: '4' })
  const [foto, setFoto] = useState<{ arquivo: File; base64: string } | null>(null)
  const [qrAberto, setQrAberto] = useState<Convite | null>(null)
  const [error, setError] = useState<string | null>(null)

  const { data: convites } = useQuery<Convite[]>({
    queryKey: ['convites'],
    queryFn: async () => (await client.get('/morador/visitantes/pre-autorizar')).data.data,
  })

  const criar = useMutation({
    mutationFn: async () => {
      const contextos = (await client.get('/morador/contextos')).data.data as any[]
      const unidadeId = localStorage.getItem('unidadeId') ?? contextos[0]?.unidade_id
      const agora = Date.now()
      const res = await client.post('/morador/visitantes/pre-autorizar', {
        nome: form.nome,
        documento: form.documento || undefined,
        unidade_id: unidadeId,
        valido_de: new Date(agora - 5 * 60_000).toISOString(),
        valido_ate: new Date(agora + parseInt(form.horas, 10) * 3_600_000).toISOString(),
        foto_base64: foto?.base64,
      })
      return res.data.data as Convite
    },
    onSuccess: (convite) => {
      setForm({ nome: '', documento: '', horas: '4' })
      setFoto(null)
      setQrAberto(convite)
      setError(null)
      qc.invalidateQueries({ queryKey: ['convites'] })
    },
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao criar convite'),
  })

  const vigentes = (convites ?? []).filter((c) => new Date(c.valido_ate) > new Date())

  return (
    <div className="mt-6 space-y-3">
      <h3 className="text-xs tracking-widest uppercase text-gray-400 px-1">Convidar visitante</h3>

      {qrAberto ? (
        <div className="bg-white rounded-3xl p-6 shadow-sm text-center">
          <h4 className="font-bold text-gray-900">{qrAberto.nome}</h4>
          <p className="text-xs text-gray-500 mb-3">
            válido até {new Date(qrAberto.valido_ate).toLocaleString('pt-BR')}
          </p>
          {qrAberto.qr_token && <QrCanvas token={qrAberto.qr_token} />}
          <p className="text-[11px] font-mono text-gray-400 mt-2">{qrAberto.qr_token}</p>
          <p className="text-sm text-gray-600 mt-3">
            Envie este QR ao visitante — é só apresentar no leitor facial da portaria.
          </p>
          {qrAberto.foto_base64 && (
            <p className="text-sm text-brand-600 mt-2">
              📷 Reconhecimento facial também configurado — o visitante pode entrar só pelo rosto,
              sem precisar do QR, dentro da validade do convite.
            </p>
          )}
          <Button className="w-full mt-4" onClick={() => setQrAberto(null)}>Fechar</Button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            criar.mutate()
          }}
          className="bg-white rounded-2xl p-4 shadow-sm space-y-3"
        >
          <TextField label="Nome do visitante" value={form.nome}
            onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))} required />
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Documento (opcional)" value={form.documento}
              onChange={(e) => setForm((p) => ({ ...p, documento: e.target.value }))} />
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Validade</span>
              <select value={form.horas}
                onChange={(e) => setForm((p) => ({ ...p, horas: e.target.value }))}
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm">
                <option value="2">2 horas</option>
                <option value="4">4 horas</option>
                <option value="12">12 horas</option>
                <option value="24">24 horas</option>
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-sm font-medium text-gray-700">
              Foto do visitante (opcional) — libera pelo facial, além do QR
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={async (e) => {
                const arquivo = e.target.files?.[0]
                if (!arquivo) return setFoto(null)
                setFoto({ arquivo, base64: await arquivoParaBase64(arquivo) })
              }}
              className="mt-1 block w-full text-sm text-gray-600 file:mr-3 file:rounded-xl file:border-0 file:bg-brand-50 file:px-3 file:py-2 file:text-brand-700 file:text-sm"
            />
            {foto && <p className="text-xs text-gray-500 mt-1">{foto.arquivo.name} anexada</p>}
          </label>
          {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}
          <Button type="submit" className="w-full" disabled={criar.isPending || !form.nome}>
            {criar.isPending ? 'Gerando...' : 'Gerar convite'}
          </Button>
        </form>
      )}

      {vigentes.length > 0 && !qrAberto && (
        <div className="space-y-2">
          {vigentes.map((c) => (
            <button key={c.id} onClick={() => setQrAberto(c)}
              className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between text-left">
              <span>
                <span className="block font-semibold text-gray-900">{c.nome}</span>
                <span className="block text-xs text-gray-500">
                  até {new Date(c.valido_ate).toLocaleString('pt-BR')}
                </span>
              </span>
              <span className="text-brand-600 text-sm font-semibold">Ver QR</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
