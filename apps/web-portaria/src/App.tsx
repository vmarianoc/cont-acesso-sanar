import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { PushRegistrar } from '@condar/ui'
import LoginPage from './pages/LoginPage'
import RecuperarPage from './pages/RecuperarPage'
import PortariaPage from './pages/PortariaPage'
import VisitantePage from './pages/VisitantePage'
import ImportarPage from './pages/ImportarPage'
import SolicitarPage from './pages/SolicitarPage'
import OcorrenciaPage from './pages/OcorrenciaPage'
import PresencaPage from './pages/PresencaPage'
import ChatPage from './pages/ChatPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return <><PushRegistrar />{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/portaria" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/recuperar" element={<RecuperarPage />} />
        <Route path="/convite" element={<RecuperarPage convite />} />
        <Route
          path="/portaria"
          element={
            <RequireAuth>
              <PortariaPage />
            </RequireAuth>
          }
        />
        <Route
          path="/visitante"
          element={
            <RequireAuth>
              <VisitantePage />
            </RequireAuth>
          }
        />
        <Route
          path="/chat"
          element={
            <RequireAuth>
              <ChatPage />
            </RequireAuth>
          }
        />
        <Route
          path="/presenca"
          element={
            <RequireAuth>
              <PresencaPage />
            </RequireAuth>
          }
        />
        <Route
          path="/ocorrencia"
          element={
            <RequireAuth>
              <OcorrenciaPage />
            </RequireAuth>
          }
        />
        <Route
          path="/solicitar"
          element={
            <RequireAuth>
              <SolicitarPage />
            </RequireAuth>
          }
        />
        <Route
          path="/importar"
          element={
            <RequireAuth>
              <ImportarPage />
            </RequireAuth>
          }
        />
      </Routes>
    </BrowserRouter>
  )
}
