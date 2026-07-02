import { useSyncStatus } from '../hooks/useSyncStatus'

const statusConfig = {
  synced: { label: 'Sincronizado', color: 'bg-green-500' },
  syncing: { label: 'Sincronizando...', color: 'bg-yellow-500' },
  offline: { label: 'Offline', color: 'bg-red-500' },
  error: { label: 'Erro de sync', color: 'bg-red-600' },
}

export default function StatusBar() {
  const { online, syncStatus } = useSyncStatus()
  const config = statusConfig[syncStatus]

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`h-2 w-2 rounded-full ${config.color} inline-block`} />
      <span className="text-white/80">{config.label}</span>
      {!online && <span className="text-red-300 font-medium">· Sem conexão</span>}
    </div>
  )
}
