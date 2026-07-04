import { useNavigate } from 'react-router-dom'
import { RecuperarSenha } from '@condar/ui'

export default function RecuperarPage({ convite = false }: { convite?: boolean }) {
  const navigate = useNavigate()
  return <RecuperarSenha convite={convite} onVoltar={() => navigate('/login')} />
}
