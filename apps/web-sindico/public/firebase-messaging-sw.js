/* Service worker do FCM (Web Push). Mensagens com payload `notification`
   são exibidas automaticamente quando o app está em segundo plano. */
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js')
importScripts('https://www.gstatic.com/firebasejs/10.14.1/firebase-messaging-compat.js')

firebase.initializeApp({
  apiKey: 'AIzaSyB3bpk1ZVP8f_XJwyPbUdszbe_5z7UIOv4',
  authDomain: 'condar-app-502111.firebaseapp.com',
  projectId: 'condar-app-502111',
  storageBucket: 'condar-app-502111.firebasestorage.app',
  messagingSenderId: '790088809283',
  appId: '1:790088809283:web:0fd59bb6206033f39f0df6',
})

const messaging = firebase.messaging()

messaging.onBackgroundMessage((payload) => {
  const n = payload.notification || {}
  self.registration.showNotification(n.title || 'condar', {
    body: n.body || '',
    icon: '/icon-192.png',
    data: payload.data || {},
  })
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(clients.openWindow('/'))
})
