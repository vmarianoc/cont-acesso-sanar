import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import GestaoPage from './pages/GestaoPage'
import AprovacoesPage from './pages/AprovacoesPage'
import LicencaPage from './pages/LicencaPage'
import UsuariosPage from './pages/UsuariosPage'
import UnidadesPage from './pages/UnidadesPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!localStorage.getItem('token')) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><GestaoPage /></RequireAuth>} />
        <Route path="/aprovacoes" element={<RequireAuth><AprovacoesPage /></RequireAuth>} />
        <Route path="/unidades" element={<RequireAuth><UnidadesPage /></RequireAuth>} />
        <Route path="/licenca" element={<RequireAuth><LicencaPage /></RequireAuth>} />
        <Route path="/usuarios" element={<RequireAuth><UsuariosPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
