import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import PainelPage from './pages/PainelPage'
import CadastrosPage from './pages/CadastrosPage'
import EncomendasPage from './pages/EncomendasPage'
import LiberacoesPage from './pages/LiberacoesPage'
import DispositivosPage from './pages/DispositivosPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  if (!localStorage.getItem('token')) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<RequireAuth><PainelPage /></RequireAuth>} />
        <Route path="/cadastros" element={<RequireAuth><CadastrosPage /></RequireAuth>} />
        <Route path="/encomendas" element={<RequireAuth><EncomendasPage /></RequireAuth>} />
        <Route path="/liberacoes" element={<RequireAuth><LiberacoesPage /></RequireAuth>} />
        <Route path="/dispositivos" element={<RequireAuth><DispositivosPage /></RequireAuth>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
