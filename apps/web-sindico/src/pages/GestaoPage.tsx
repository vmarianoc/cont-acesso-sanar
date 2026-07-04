import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AppScreen, Header, Card, Logo } from '@condar/ui'
import { fetchAprovacoes, fetchLicenca } from '../api/sindico'
import { useAuth } from '../hooks/useAuth'
import BottomNav from '../components/BottomNav'

export default function GestaoPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { data: pendentes } = useQuery({
    queryKey: ['aprovacoes', 'pendente'],
    queryFn: () => fetchAprovacoes('pendente'),
    refetchInterval: 10000,
  })
  const { data: licenca } = useQuery({ queryKey: ['licenca'], queryFn: fetchLicenca })

  const usoPct =
    licenca && licenca.limites.unidades
      ? Math.round((licenca.uso.unidades / licenca.limites.unidades) * 100)
      : null

  return (
    <AppScreen bottomNav>
      <Header>
        <div className="flex items-center justify-between">
          <Logo subtitle="Gestão" />
          <button onClick={() => { logout(); navigate('/login') }} className="text-white/70 text-sm">
            Sair
          </button>
        </div>
        <h1 className="text-2xl font-bold mt-4">Painel do síndico</h1>
        <p className="text-white/80 text-sm">Visão geral do condomínio</p>
      </Header>

      <div className="px-5 -mt-2 mt-4 space-y-3">
        <Card
          icon="✅"
          iconBg="bg-brand-600"
          titulo={`${pendentes?.length ?? 0} aprovação(ões) pendente(s)`}
          sub="Toque para revisar"
          onClick={() => navigate('/aprovacoes')}
        />
        <Card
          icon="📋"
          iconBg="bg-gray-800"
          titulo="Ocorrências"
          sub="Livro digital da portaria"
          onClick={() => navigate('/ocorrencias')}
        />
        <Card
          icon="📣"
          titulo="Comunicados"
          sub="Publicar avisos com confirmação de leitura"
          onClick={() => navigate('/comunicados')}
        />
        <Card
          icon="📄"
          iconBg="bg-gray-800"
          titulo="Documentos"
          sub="Convenção, atas e docs por grupo"
          onClick={() => navigate('/documentos')}
        />
        {licenca && (
          <Card
            icon="🏢"
            iconBg="bg-gray-800"
            titulo={`${licenca.uso.unidades} unidades${licenca.limites.unidades ? ` de ${licenca.limites.unidades}` : ''}`}
            sub={`Plano ${licenca.plano.toUpperCase()}${usoPct !== null ? ` · ${usoPct}% do limite` : ''}`}
            onClick={() => navigate('/licenca')}
          />
        )}
        {licenca && !licenca.ativa && (
          <div className="bg-red-50 border border-red-200 text-red-800 text-sm p-3 rounded-2xl">
            Licença inativa — regularize para manter as funções administrativas.
          </div>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
