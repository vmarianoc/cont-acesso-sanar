import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import EventFeed from '../components/EventFeed'
import StatusBar from '../components/StatusBar'
import Logo from '../components/Logo'
import { useAuth } from '../hooks/useAuth'
import { useDispositivos } from '../hooks/useDispositivos'
import { useRegistrarEvento } from '../hooks/useRegistrarEvento'
import BuscaGlobal from '../components/BuscaGlobal'
import { fetchEncomendas } from '../api/encomendas'

function Clock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  }, [])
  return (
    <span className="text-white font-mono text-sm">{time.toLocaleTimeString('pt-BR')}</span>
  )
}

export default function PortariaPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()
  const { data: dispositivos } = useDispositivos()
  const registrar = useRegistrarEvento()

  const dispositivoId = dispositivos?.[0]?.id
  const [feedback, setFeedback] = useState<string | null>(null)
  const { data: encomendasAguardando } = useQuery({
    queryKey: ['encomendas', 'aguardando'],
    queryFn: () => fetchEncomendas('aguardando'),
    refetchInterval: 20000,
  })

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  const registrarManual = async (tipo: string, resultado: 'liberado' | 'negado') => {
    if (!dispositivoId) {
      setFeedback('Nenhum ponto de acesso configurado')
      return
    }
    try {
      await registrar.mutateAsync({ dispositivo_id: dispositivoId, tipo, resultado, metodo: 'manual' })
      setFeedback(`${tipo} registrado (${resultado})`)
    } catch {
      setFeedback('Falha ao registrar evento')
    }
    setTimeout(() => setFeedback(null), 3000)
  }

  return (
    <div className="min-h-screen lg:h-screen flex flex-col bg-gray-100 lg:overflow-hidden">
      {/* Header */}
      <header className="bg-brand-700 px-4 py-2 flex flex-wrap items-center justify-between gap-y-2 flex-shrink-0">
        <Logo subtitle="Portaria" />
        <div className="flex flex-wrap items-center justify-end gap-3 sm:gap-6">
          <BuscaGlobal />
          <Clock />
          <StatusBar />
          <button
            onClick={() => navigate('/visitante')}
            className="bg-white/10 hover:bg-white/20 text-white text-sm px-3 py-1.5 rounded-md transition-colors"
          >
            + Visitante
          </button>
          <button
            onClick={() => navigate('/encomenda')}
            className="bg-white/10 hover:bg-white/20 text-white text-sm px-3 py-1.5 rounded-md transition-colors"
          >
            📦 Encomendas{encomendasAguardando?.length ? ` (${encomendasAguardando.length})` : ''}
          </button>
          <button
            onClick={handleLogout}
            className="text-white/60 hover:text-white text-sm transition-colors"
          >
            Sair
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-col flex-1 gap-4 p-4 lg:overflow-hidden">
        {!!encomendasAguardando?.length && (
          <button
            onClick={() => navigate('/encomenda')}
            className="bg-amber-50 border border-amber-200 text-amber-800 text-sm px-4 py-2 rounded-lg text-left hover:bg-amber-100 transition-colors flex-shrink-0"
          >
            📦 {encomendasAguardando.length} encomenda(s) aguardando retirada — toque para ver
          </button>
        )}

        {/* Event feed */}
        <div className="flex-1 flex flex-col bg-white rounded-lg shadow-sm overflow-hidden lg:max-w-2xl lg:mx-auto lg:w-full">
          <div className="p-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">Eventos Recentes</h2>
          </div>
          <div className="flex-1 p-3 overflow-hidden">
            <EventFeed />
          </div>
        </div>
      </div>

      {/* Action bar */}
      <footer className="bg-white border-t border-gray-200 px-4 py-2 flex flex-wrap items-center gap-3 flex-shrink-0">
        <button
          onClick={() => registrarManual('abertura_cancela', 'liberado')}
          disabled={registrar.isPending}
          className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-50"
        >
          Abrir Cancela
        </button>
        <button
          onClick={() => registrarManual('fechamento_cancela', 'liberado')}
          disabled={registrar.isPending}
          className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-50"
        >
          Fechar Cancela
        </button>
        <button
          onClick={() => registrarManual('acesso_manual', 'liberado')}
          disabled={registrar.isPending}
          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors disabled:opacity-50"
        >
          Acesso Manual
        </button>
        <button
          onClick={() => navigate('/visitante')}
          className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          Cadastrar Visitante
        </button>
        <button
          onClick={() => navigate('/encomenda')}
          className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          Registrar Encomenda
        </button>
        <button
          onClick={() => navigate('/chat')}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          Chat
        </button>
        <button
          onClick={() => navigate('/presenca')}
          className="bg-teal-600 hover:bg-teal-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          Visitantes
        </button>
        <button
          onClick={() => navigate('/ocorrencia')}
          className="bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          Registrar Ocorrência
        </button>
        <button
          onClick={() => navigate('/solicitar')}
          className="bg-gray-800 hover:bg-gray-900 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          Chamar Morador
        </button>
        {feedback && <span className="text-sm text-gray-600 ml-2">{feedback}</span>}
      </footer>
    </div>
  )
}
