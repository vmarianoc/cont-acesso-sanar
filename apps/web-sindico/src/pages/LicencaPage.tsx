import { useQuery } from '@tanstack/react-query'
import { AppScreen, Header, Stat, Badge } from '@condar/ui'
import { fetchLicenca } from '../api/sindico'
import BottomNav from '../components/BottomNav'

function Barra({ uso, limite }: { uso: number; limite: number | null }) {
  if (limite === null) return <p className="text-sm text-gray-500 mt-1">Ilimitado</p>
  const pct = Math.min(100, Math.round((uso / limite) * 100))
  const cor = pct >= 90 ? 'bg-brand-600' : pct >= 70 ? 'bg-amber-500' : 'bg-green-500'
  return (
    <div className="mt-2">
      <div className="h-2 w-full rounded-full bg-gray-100 overflow-hidden">
        <div className={`h-full ${cor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-xs text-gray-500 mt-1">
        {uso} de {limite} ({pct}%)
      </p>
    </div>
  )
}

export default function LicencaPage() {
  const { data: l } = useQuery({ queryKey: ['licenca'], queryFn: fetchLicenca })

  return (
    <AppScreen bottomNav>
      <Header eyebrow="Plano e licença" title={l ? `Plano ${l.plano.toUpperCase()}` : 'Plano'} />

      <div className="px-5 mt-4 space-y-4">
        {l && (
          <>
            {(l as any).codigo_condominio && (
              <div className="bg-white rounded-2xl p-4 shadow-sm">
                <p className="text-xs tracking-widest uppercase text-gray-400">Código do condomínio</p>
                <p className="text-2xl font-mono font-bold text-gray-900">{(l as any).codigo_condominio}</p>
                <p className="text-xs text-gray-500 mt-1">Use este código no login do computador da portaria.</p>
              </div>
            )}
            <div className="bg-white rounded-2xl p-4 shadow-sm flex items-center justify-between">
              <span className="font-medium text-gray-800">Status</span>
              <Badge tone={l.ativa && !l.expirada ? 'green' : 'red'}>
                {l.expirada ? 'expirada' : l.ativa ? 'ativa' : 'inativa'}
              </Badge>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="font-semibold text-gray-900">Unidades</p>
              <Barra uso={l.uso.unidades} limite={l.limites.unidades} />
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm">
              <p className="font-semibold text-gray-900">Dispositivos</p>
              <Barra uso={l.uso.dispositivos} limite={l.limites.dispositivos} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <Stat label="Unidades em uso" value={l.uso.unidades} />
              <Stat
                label="Validade"
                value={l.validade ? new Date(l.validade).toLocaleDateString('pt-BR') : '—'}
              />
            </div>
          </>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
