import { useNavigate } from 'react-router-dom'
import VisitorForm from '../components/VisitorForm'

export default function VisitantePage() {
  const navigate = useNavigate()

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <button
            onClick={() => navigate('/portaria')}
            className="text-gray-500 hover:text-gray-700 text-sm transition-colors"
          >
            ← Voltar à Portaria
          </button>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h1 className="text-xl font-semibold text-gray-900 mb-1">Pré-autorizar Visitante</h1>
          <p className="text-sm text-gray-500 mb-6">
            Preencha os dados do visitante para gerar uma autorização de acesso.
          </p>
          <VisitorForm onSuccess={() => navigate('/portaria')} />
        </div>
      </div>
    </div>
  )
}
