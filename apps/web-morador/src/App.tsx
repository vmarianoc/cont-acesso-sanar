import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import RecuperarPage from './pages/RecuperarPage'
import HomePage from './pages/HomePage'
import AutorizarPage from './pages/AutorizarPage'
import ReservasPage from './pages/ReservasPage'
import EncomendasPage from './pages/EncomendasPage'
import AvisosPage from './pages/AvisosPage'
import OcorrenciasPage from './pages/OcorrenciasPage'
import RealtimeSync from './components/RealtimeSync'

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!localStorage.getItem('token')) return <Navigate to="/login" replace />
  return (
    <>
      <RealtimeSync />
      {children}
    </>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/recuperar" element={<RecuperarPage />} />
        <Route path="/convite" element={<RecuperarPage convite />} />
        <Route path="/" element={<RequireAuth><HomePage /></RequireAuth>} />
        <Route path="/acesso" element={<RequireAuth><AutorizarPage /></RequireAuth>} />
        <Route path="/reservas" element={<RequireAuth><ReservasPage /></RequireAuth>} />
        <Route path="/encomendas" element={<RequireAuth><EncomendasPage /></RequireAuth>} />
        <Route path="/avisos" element={<RequireAuth><AvisosPage /></RequireAuth>} />
        <Route path="/ocorrencias" element={<RequireAuth><OcorrenciasPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
