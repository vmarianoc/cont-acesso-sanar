import { useNavigate, useLocation } from 'react-router-dom'
import { BottomNav as UIBottomNav, type NavItem } from '@condar/ui'

const ITENS: NavItem[] = [
  { to: '/', label: 'Início', icon: '🏠' },
  { to: '/acesso', label: 'Acesso', icon: '🔑' },
  { to: '/reservas', label: 'Reservas', icon: '📅' },
  { to: '/encomendas', label: 'Mais', icon: '📦' },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return <UIBottomNav items={ITENS} current={pathname} onNavigate={navigate} />
}
