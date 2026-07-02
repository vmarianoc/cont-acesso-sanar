import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { fetchResumo } from '../api/morador'
import BottomNav from '../components/BottomNav'

function iniciais(nome: string) {
  return nome.split(' ').slice(0, 2).map((p) => p[0]).join('').toUpperCase()
}

const ACOES = [
  { to: '/acesso', label: 'Portaria', icon: '🔑' },
  { to: '/reservas', label: 'Reservas', icon: '📅' },
  { to: '/encomendas', label: 'Encomendas', icon: '📦' },
]

export default function HomePage() {
  const navigate = useNavigate()
  const { data: r } = useQuery({ queryKey: ['resumo'], queryFn: fetchResumo, refetchInterval: 10000 })

  const primeiroNome = r?.nome?.split(' ')[0] ?? ''

  return (
    <div className="min-h-screen bg-areia pb-24 max-w-md mx-auto">
      <header className="bg-brand-600 rounded-b-3xl px-5 pt-6 pb-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-white/15 font-bold">c</span>
            <span className="font-bold text-lg lowercase tracking-tight">condar</span>
          </div>
          <span className="grid h-10 w-10 place-items-center rounded-full bg-white/15 text-sm font-semibold">
            {r ? iniciais(r.nome) : '·'}
          </span>
        </div>
        <p className="text-white/80 text-xs tracking-widest mt-4 uppercase">
          {r?.condominio ?? '—'}
          {r?.unidade ? ` · AP ${r.unidade}` : ''}
        </p>
        <h1 className="text-3xl font-bold mt-1">Olá, {primeiroNome}</h1>
      </header>

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
              iconBg="bg-brand-600"
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
          <button
            onClick={() => navigate('/acesso')}
            className="w-full mt-4 rounded-2xl bg-brand-600 py-4 font-semibold text-white hover:bg-brand-700"
          >
            Liberar visitante
          </button>
        )}
      </div>

      <BottomNav />
    </div>
  )
}

function Card({
  icon,
  iconBg,
  titulo,
  sub,
  onClick,
}: {
  icon: string
  iconBg: string
  titulo: string
  sub: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 text-left"
    >
      <span className={`grid h-11 w-11 place-items-center rounded-xl ${iconBg} text-xl`}>{icon}</span>
      <span>
        <span className="block font-semibold text-gray-900">{titulo}</span>
        <span className="block text-sm text-gray-500">{sub}</span>
      </span>
    </button>
  )
}
