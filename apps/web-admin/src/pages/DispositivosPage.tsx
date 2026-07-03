import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Button, TextField, Badge, IconTile } from '@condar/ui'
import { fetchDispositivos, criarDispositivo, atualizarDispositivo, type Dispositivo } from '../api/admin'
import BottomNav from '../components/BottomNav'

const TIPOS = [
  { value: 'leitor_facial', label: 'Leitor facial', icon: '🙂' },
  { value: 'catraca', label: 'Catraca', icon: '🚧' },
  { value: 'cancela', label: 'Cancela', icon: '🚗' },
  { value: 'leitor_qrcode', label: 'Leitor QR Code', icon: '🔳' },
  { value: 'interfone', label: 'Interfone', icon: '📞' },
] as const

const iconeDe = (tipo: string) => TIPOS.find((t) => t.value === tipo)?.icon ?? '🔌'

export default function DispositivosPage() {
  const qc = useQueryClient()
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ nome: '', tipo: 'leitor_facial', area: '', local: '' })
  const [error, setError] = useState<string | null>(null)

  const { data: dispositivos } = useQuery({ queryKey: ['dispositivos'], queryFn: fetchDispositivos })

  const invalidar = () => qc.invalidateQueries({ queryKey: ['dispositivos'] })

  const criar = useMutation({
    mutationFn: () =>
      criarDispositivo({
        nome: form.nome,
        tipo: form.tipo,
        area: form.area.trim().toLowerCase().replace(/\s+/g, '_'),
        local: form.local || undefined,
      }),
    onSuccess: () => {
      invalidar()
      setForm({ nome: '', tipo: 'leitor_facial', area: '', local: '' })
      setMostrarForm(false)
      setError(null)
    },
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao criar'),
  })

  const alternar = useMutation({
    mutationFn: (d: Dispositivo) => atualizarDispositivo(d.id, { ativo: !d.ativo }),
    onSuccess: invalidar,
    onError: (err: any) => setError(err.response?.data?.erro?.mensagem ?? 'Falha ao atualizar'),
  })

  const porArea = new Map<string, Dispositivo[]>()
  for (const d of dispositivos ?? []) {
    if (!porArea.has(d.area)) porArea.set(d.area, [])
    porArea.get(d.area)!.push(d)
  }

  return (
    <AppScreen bottomNav>
      <Header
        variant="tinta"
        eyebrow="Controle de acesso"
        title="Áreas e dispositivos"
        right={
          <button
            onClick={() => setMostrarForm((v) => !v)}
            className="bg-white/15 hover:bg-white/25 text-white text-sm px-3 py-1.5 rounded-xl"
          >
            {mostrarForm ? 'Fechar' : '+ Dispositivo'}
          </button>
        }
      />

      <div className="px-5 mt-4 space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-xl">{error}</p>}

        {mostrarForm && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              criar.mutate()
            }}
            className="bg-white rounded-2xl p-4 shadow-sm space-y-3"
          >
            <TextField
              label="Nome do dispositivo"
              placeholder="Ex.: Leitor Facial — Piscina"
              value={form.nome}
              onChange={(e) => setForm((p) => ({ ...p, nome: e.target.value }))}
              required
            />
            <label className="block">
              <span className="text-sm font-medium text-gray-700">Tipo</span>
              <select
                value={form.tipo}
                onChange={(e) => setForm((p) => ({ ...p, tipo: e.target.value }))}
                className="mt-1 block w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {TIPOS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <TextField
                label="Área"
                placeholder="piscina"
                value={form.area}
                onChange={(e) => setForm((p) => ({ ...p, area: e.target.value }))}
                required
              />
              <TextField
                label="Local (opcional)"
                placeholder="Portão lateral"
                value={form.local}
                onChange={(e) => setForm((p) => ({ ...p, local: e.target.value }))}
              />
            </div>
            <Button type="submit" disabled={criar.isPending || !form.nome || !form.area} className="w-full">
              {criar.isPending ? 'Criando...' : 'Criar dispositivo'}
            </Button>
          </form>
        )}

        {[...porArea.entries()].map(([area, itens]) => (
          <div key={area}>
            <h3 className="text-xs tracking-widest uppercase text-gray-400 px-1 mb-2">{area}</h3>
            <div className="space-y-2">
              {itens.map((d) => (
                <div key={d.id} className="bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3">
                  <IconTile icon={iconeDe(d.tipo)} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-semibold text-gray-900 truncate">{d.nome}</span>
                    <span className="block text-xs text-gray-500">
                      {d.tipo.replace(/_/g, ' ')}
                      {d.local ? ` · ${d.local}` : ''}
                    </span>
                  </span>
                  <span className="flex flex-col items-end gap-1">
                    <Badge tone={d.ativo ? 'green' : 'red'}>{d.ativo ? 'ativo' : 'inativo'}</Badge>
                    <button
                      onClick={() => alternar.mutate(d)}
                      disabled={alternar.isPending}
                      className="text-xs text-brand-600 font-semibold disabled:opacity-50"
                    >
                      {d.ativo ? 'Desativar' : 'Ativar'}
                    </button>
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {dispositivos?.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm">
            Nenhum dispositivo cadastrado.
          </div>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
