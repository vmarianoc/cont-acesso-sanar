import admin from 'firebase-admin'

const TOKENS_INVALIDOS = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
])

let app: admin.app.App | null | undefined

function getApp(): admin.app.App | null {
  if (app !== undefined) return app
  const credencial = process.env.FCM_SERVICE_ACCOUNT_JSON
  app = credencial
    ? admin.initializeApp({ credential: admin.credential.cert(JSON.parse(credencial)) })
    : null
  return app
}

export interface PushMensagem {
  tokens: string[]
  titulo: string
  corpo: string
  fotoUrl?: string | null
  dados?: Record<string, unknown>
}

export interface PushResultado {
  /** 'fcm': enviado via Firebase Cloud Messaging. 'stub': sem credenciais configuradas (dev/test) ou sem tokens. */
  modo: 'fcm' | 'stub'
  enviados: number
  falhas: number
  tokensInvalidos: string[]
}

/** Envia push via FCM (cobre Android/iOS/Web). Sem FCM_SERVICE_ACCOUNT_JSON, roda em modo degradado (não falha). */
export async function enviarPush(msg: PushMensagem): Promise<PushResultado> {
  const firebaseApp = getApp()
  if (!firebaseApp || msg.tokens.length === 0) {
    return { modo: 'stub', enviados: 0, falhas: 0, tokensInvalidos: [] }
  }

  const dadosString = Object.fromEntries(
    Object.entries(msg.dados ?? {}).map(([chave, valor]) => [chave, String(valor)])
  )
  const imageUrl = msg.fotoUrl ?? undefined

  const resposta = await firebaseApp.messaging().sendEachForMulticast({
    tokens: msg.tokens,
    notification: { title: msg.titulo, body: msg.corpo, imageUrl },
    android: imageUrl ? { notification: { imageUrl } } : undefined,
    apns: imageUrl
      ? { fcmOptions: { imageUrl }, payload: { aps: { 'mutable-content': 1 } } }
      : undefined,
    data: dadosString,
  })

  const tokensInvalidos: string[] = []
  resposta.responses.forEach((r, i) => {
    if (!r.success && r.error && TOKENS_INVALIDOS.has(r.error.code)) {
      tokensInvalidos.push(msg.tokens[i])
    }
  })

  return {
    modo: 'fcm',
    enviados: resposta.successCount,
    falhas: resposta.failureCount,
    tokensInvalidos,
  }
}
