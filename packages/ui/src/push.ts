import { useEffect } from 'react'
import { initializeApp, getApps } from 'firebase/app'
import { getMessaging, getToken, isSupported } from 'firebase/messaging'
import client from './client'

// Configuração pública do app Web no Firebase (projeto condar-app-502111).
// Não é segredo: identifica o projeto, a segurança vem das regras do servidor.
const firebaseConfig = {
  apiKey: 'AIzaSyB3bpk1ZVP8f_XJwyPbUdszbe_5z7UIOv4',
  authDomain: 'condar-app-502111.firebaseapp.com',
  projectId: 'condar-app-502111',
  storageBucket: 'condar-app-502111.firebasestorage.app',
  messagingSenderId: '790088809283',
  appId: '1:790088809283:web:0fd59bb6206033f39f0df6',
}

// Chave pública VAPID (Certificados push da Web no console do Firebase).
// Pode ser sobrescrita por env (VITE_FIREBASE_VAPID_KEY) sem rebuild do pacote.
const VAPID_KEY =
  (import.meta as any).env?.VITE_FIREBASE_VAPID_KEY ??
  'BKFToUjSWHIxMqKb_YF4kpRprnMV7IxnlIg17I7Mcf4rxsxH0Bwjb1DgqhgiZ-7KNpdY_SUrtWGuStGx6Uq3EuY'

/**
 * Pede permissão de notificação (se necessário), obtém o token FCM do
 * navegador e registra na API. Retorna true se o push ficou ativo.
 */
export async function ativarPush(): Promise<boolean> {
  try {
    if (!(await isSupported())) return false
    if (Notification.permission === 'denied') return false
    if (Notification.permission !== 'granted') {
      const permissao = await Notification.requestPermission()
      if (permissao !== 'granted') return false
    }
    const app = getApps()[0] ?? initializeApp(firebaseConfig)
    const token = await getToken(getMessaging(app), { vapidKey: VAPID_KEY })
    if (!token) return false
    if (token === localStorage.getItem('pushToken')) return true
    await client.post('/push/token', { token, plataforma: 'web' })
    localStorage.setItem('pushToken', token)
    return true
  } catch (err) {
    console.warn('[push] não foi possível ativar', err)
    return false
  }
}

/**
 * Monte uma vez no App: quando houver sessão, ativa o push (pedindo a
 * permissão uma única vez por instalação). Reavalia ao focar a janela,
 * cobrindo o login via navegação SPA.
 */
export function PushRegistrar() {
  useEffect(() => {
    let registrado = false
    const tentar = async () => {
      if (registrado || !localStorage.getItem('token')) return
      const jaPediu = localStorage.getItem('pushPedido')
      if (Notification.permission !== 'granted' && jaPediu) return
      localStorage.setItem('pushPedido', '1')
      registrado = await ativarPush()
    }
    tentar()
    const timer = setInterval(tentar, 15000)
    window.addEventListener('focus', tentar)
    return () => {
      clearInterval(timer)
      window.removeEventListener('focus', tentar)
    }
  }, [])
  return null
}
