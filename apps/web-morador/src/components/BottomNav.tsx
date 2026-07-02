import { useNavigate, useLocation } from 'react-router-dom'

const ITENS = [
  { to: '/', label: 'Início', icon: '🏠' },
  { to: '/acesso', label: 'Acesso', icon: '🔑' },
  { to: '/reservas', label: 'Reservas', icon: '📅' },
  { to: '/encomendas', label: 'Mais', icon: '📦' },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return (
    <nav className="fixed bottom-0 inset-x-0 mx-auto max-w-md bg-white border-t border-gray-200 flex justify-around py-2 pb-[env(safe-area-inset-bottom)]">
      {ITENS.map((i) => {
        const ativo = pathname === i.to
        return (
          <button
            key={i.to}
            onClick={() => navigate(i.to)}
            className={`flex flex-col items-center gap-0.5 px-3 ${ativo ? 'text-brand-600' : 'text-gray-400'}`}
          >
            <span className="text-xl">{i.icon}</span>
            <span className="text-xs font-medium">{i.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
