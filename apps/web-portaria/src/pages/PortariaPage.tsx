import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import EventFeed from '../components/EventFeed'
import StatusBar from '../components/StatusBar'
import { useAuth } from '../hooks/useAuth'

const CAMERAS = [
  { id: '1', label: 'Entrada Principal' },
  { id: '2', label: 'Garagem' },
  { id: '3', label: 'Saída' },
  { id: '4', label: 'Área de Serviço' },
]

function Clock() {
  const [time, setTime] = useState(new Date())
  useState(() => {
    const interval = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(interval)
  })
  return (
    <span className="text-white font-mono text-sm">
      {time.toLocaleTimeString('pt-BR')}
    </span>
  )
}

export default function PortariaPage() {
  const navigate = useNavigate()
  const { logout } = useAuth()

  const handleLogout = async () => {
    await logout()
    navigate('/login')
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100 overflow-hidden">
      {/* Header */}
      <header className="bg-brand-700 px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="text-white font-bold text-lg">Access Platform</div>
          <div className="text-white/60 text-sm">Portaria</div>
        </div>
        <div className="flex items-center gap-6">
          <Clock />
          <StatusBar />
          <button
            onClick={() => navigate('/visitante')}
            className="bg-white/10 hover:bg-white/20 text-white text-sm px-3 py-1.5 rounded-md transition-colors"
          >
            + Visitante
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
      <div className="flex flex-1 gap-4 p-4 overflow-hidden">
        {/* Camera grid */}
        <div className="flex-1 grid grid-cols-2 grid-rows-2 gap-3">
          {CAMERAS.map((cam) => (
            <div
              key={cam.id}
              className="bg-black rounded-lg overflow-hidden relative flex items-center justify-center"
            >
              <div className="text-gray-600 text-sm">Feed de câmera</div>
              <div className="absolute bottom-2 left-2 bg-black/60 text-white text-xs px-2 py-0.5 rounded">
                {cam.label}
              </div>
              <div className="absolute top-2 right-2 flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-white text-xs">AO VIVO</span>
              </div>
            </div>
          ))}
        </div>

        {/* Event feed */}
        <div className="w-80 flex flex-col bg-white rounded-lg shadow-sm overflow-hidden">
          <div className="p-3 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-800">Eventos Recentes</h2>
          </div>
          <div className="flex-1 p-3 overflow-hidden">
            <EventFeed />
          </div>
        </div>
      </div>

      {/* Action bar */}
      <footer className="bg-white border-t border-gray-200 px-4 py-2 flex items-center gap-3 flex-shrink-0">
        <button className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          Abrir Cancela
        </button>
        <button className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          Fechar Cancela
        </button>
        <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors">
          Acesso Manual
        </button>
        <button
          onClick={() => navigate('/visitante')}
          className="bg-brand-600 hover:bg-brand-700 text-white text-sm font-medium px-4 py-2 rounded-md transition-colors"
        >
          Cadastrar Visitante
        </button>
      </footer>
    </div>
  )
}
