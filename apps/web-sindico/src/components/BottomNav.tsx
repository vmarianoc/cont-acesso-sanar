import { useNavigate, useLocation } from 'react-router-dom'
import { BottomNav as UIBottomNav, type NavItem } from '@condar/ui'

const ITENS: NavItem[] = [
  { to: '/', label: 'Gestão', icon: '📊' },
  { to: '/aprovacoes', label: 'Aprovações', icon: '✅' },
  { to: '/usuarios', label: 'Usuários', icon: '👥' },
  { to: '/licenca', label: 'Plano', icon: '📄' },
]

export default function BottomNav() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  return <UIBottomNav items={ITENS} current={pathname} onNavigate={navigate} />
}
