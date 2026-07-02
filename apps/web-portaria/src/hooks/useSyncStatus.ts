import { useState, useEffect } from 'react'

export type SyncStatus = 'synced' | 'syncing' | 'offline' | 'error'

export function useSyncStatus() {
  const [online, setOnline] = useState(navigator.onLine)
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(navigator.onLine ? 'synced' : 'offline')

  useEffect(() => {
    const handleOnline = () => {
      setOnline(true)
      setSyncStatus('synced')
    }
    const handleOffline = () => {
      setOnline(false)
      setSyncStatus('offline')
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  return { online, syncStatus, setSyncStatus }
}
