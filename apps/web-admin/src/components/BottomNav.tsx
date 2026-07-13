import { useNavigate, useLocation } from 'react-router-dom'
import { BottomNav as UIBottomNav, type NavItem } from '@condar/ui'

const ITENS: NavItem[] = [
  { to: '/', label: 'Painel', icon: '📊' },
  { to: '/cadastros', label: 'Cadastros', icon: '👥' },
  { to: '/encomendas', label: 'Encomendas', icon: '📦' },
  { to: '/liberacoes', label: 'Acessos', icon: '🔓' },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return <UIBottomNav items={ITENS} current={pathname} onNavigate={navigate} wide />
}
