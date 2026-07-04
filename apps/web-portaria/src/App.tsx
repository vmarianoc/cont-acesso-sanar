import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import LoginPage from './pages/LoginPage'
import PortariaPage from './pages/PortariaPage'
import VisitantePage from './pages/VisitantePage'
import ImportarPage from './pages/ImportarPage'
import SolicitarPage from './pages/SolicitarPage'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/portaria" replace />} />
        <Route path="/login" element={<LoginPage />} />
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
