import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppScreen, Header, Card, Stat, Logo } from '@condar/ui'
import { fetchEncomendas, fetchLiberacoes, fetchLicenca } from '../api/admin'
import { useAuth } from '../hooks/useAuth'
import BottomNav from '../components/BottomNav'

export default function PainelPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { data: aguardando } = useQuery({
    queryKey: ['encomendas', 'aguardando'],
    queryFn: () => fetchEncomendas('aguardando'),
    refetchInterval: 15000,
  })
  const { data: vigentes } = useQuery({
    queryKey: ['liberacoes', 'vigentes'],
    queryFn: () => fetchLiberacoes(true),
    refetchInterval: 15000,
  })
  const { data: licenca } = useQuery({ queryKey: ['licenca'], queryFn: fetchLicenca })

  return (
    <AppScreen bottomNav>
      <Header>
        <div className="flex items-center justify-between">
          <Logo subtitle="Administração" />
          <button onClick={() => { logout(); navigate('/login') }} className="text-white/70 text-sm">
            Sair
          </button>
        </div>
        <h1 className="text-2xl font-bold mt-4">Administração</h1>
        <p className="text-white/80 text-sm">Cadastros, encomendas e acessos</p>
      </Header>

      <div className="px-5 mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <Stat label="Encomendas aguardando" value={aguardando?.length ?? '—'} />
          <Stat label="Liberações vigentes" value={vigentes?.length ?? '—'} />
        </div>
        <Card
          icon="📦"
          titulo="Encomendas"
          sub="Registrar chegada e dar baixa"
          onClick={() => navigate('/encomendas')}
        />
        <Card
          icon="👥"
          iconBg="bg-gray-800"
          titulo="Cadastros"
          sub="Pessoas do condomínio"
          onClick={() => navigate('/cadastros')}
        />
        <Card
          icon="🔓"
          iconBg="bg-brand-600"
          titulo="Liberações de acesso"
          sub="Facial por área, temporárias e manuais"
          onClick={() => navigate('/liberacoes')}
        />
        {licenca && (
          <p className="text-xs text-gray-400 text-center">
            Plano {licenca.plano.toUpperCase()} · {licenca.uso.unidades} unidades
          </p>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
