import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppScreen, Header, Card, Button } from '@condar/ui'
import { fetchResumo } from '../api/morador'
import BottomNav from '../components/BottomNav'
import ContextoSwitcher from '../components/ContextoSwitcher'

const ACOES = [
  { to: '/acesso', label: 'Portaria', icon: '🔑' },
  { to: '/reservas', label: 'Reservas', icon: '📅' },
  { to: '/encomendas', label: 'Encomendas', icon: '📦' },
  { to: '/avisos', label: 'Avisos', icon: '🔔' },
  { to: '/ocorrencias', label: 'Ocorrências', icon: '📋' },
]

export default function HomePage() {
  const navigate = useNavigate()
  const { data: r } = useQuery({ queryKey: ['resumo'], queryFn: fetchResumo, refetchInterval: 10000 })
  const primeiroNome = r?.nome?.split(' ')[0] ?? ''

  return (
    <AppScreen bottomNav>
      <Header>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/15 font-bold">c</span>
            <span className="font-bold text-lg lowercase tracking-tight">condar</span>
          </div>
          <ContextoSwitcher />
        </div>
        <p className="text-white/80 text-xs tracking-widest mt-4 uppercase">
          {r?.condominio ?? '—'}
          {r?.unidade ? ` · AP ${r.unidade}` : ''}
        </p>
        <h1 className="text-3xl font-bold mt-1">Olá, {primeiroNome}</h1>
      </Header>

      <div className="px-5 -mt-2">
        <div className="grid grid-cols-3 gap-3 mt-4">
          {ACOES.map((a) => (
            <button
              key={a.to}
              onClick={() => navigate(a.to)}
              className="bg-white rounded-2xl py-4 shadow-sm flex flex-col items-center gap-2"
            >
              <span className="grid h-11 w-11 place-items-center rounded-full bg-brand-50 text-2xl">
                {a.icon}
              </span>
              <span className="text-sm font-medium text-gray-800">{a.label}</span>
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3">
          {!!r?.encomendas_aguardando && (
            <Card
              icon="📦"
              titulo={`${r.encomendas_aguardando} encomenda(s) na portaria`}
              sub="Aguardando retirada"
              onClick={() => navigate('/encomendas')}
            />
          )}
          {!!r?.visitantes_aguardando && (
            <Card
              icon="👤"
              iconBg="bg-gray-800"
              titulo="Visitante aguardando"
              sub="Na portaria agora"
              onClick={() => navigate('/acesso')}
            />
          )}
        </div>

        {!!r?.visitantes_aguardando && (
          <Button className="w-full mt-4" onClick={() => navigate('/acesso')}>
            Liberar visitante
          </Button>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
