import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'

/**
 * Envio de push via FCM HTTP v1 API autenticando com uma conta de serviço do
 * Firebase (Configurações do projeto → Contas de serviço → chave privada JSON).
 * Configure UMA das envs:
 *   FCM_SERVICE_ACCOUNT_PATH  — caminho do JSON no servidor (recomendado)
 *   FCM_SERVICE_ACCOUNT_JSON  — o JSON inline
 * Sem credenciais o serviço fica em modo stub (loga e não envia) — nenhuma
 * outra parte do sistema é bloqueada por isso.
 */

interface ServiceAccount {
  project_id: string
  client_email: string
  private_key: string
}

let conta: ServiceAccount | null | undefined
function serviceAccount(): ServiceAccount | null {
  if (conta !== undefined) return conta
  try {
    const raw = process.env.FCM_SERVICE_ACCOUNT_PATH
      ? readFileSync(process.env.FCM_SERVICE_ACCOUNT_PATH, 'utf8')
      : process.env.FCM_SERVICE_ACCOUNT_JSON
    conta = raw ? (JSON.parse(raw) as ServiceAccount) : null
  } catch (err) {
    console.error('[push] conta de serviço FCM inválida', err)
    conta = null
  }
  return conta
}

export function pushConfigurado(): boolean {
  return serviceAccount() !== null
}

const b64url = (v: Buffer | string) =>
  Buffer.from(v).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

let tokenCache: { token: string; expira: number } | null = null

async function accessToken(sa: ServiceAccount): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expira) return tokenCache.token
  const agora = Math.floor(Date.now() / 1000)
  const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: agora,
      exp: agora + 3600,
    })
  )
  const assinatura = createSign('RSA-SHA256').update(`${header}.${claims}`).sign(sa.private_key)
  const jwt = `${header}.${claims}.${b64url(assinatura)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${jwt}`,
  })
  if (!res.ok) throw new Error(`OAuth Google falhou: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { access_token: string; expires_in: number }
  tokenCache = { token: body.access_token, expira: Date.now() + (body.expires_in - 300) * 1000 }
  return tokenCache.token
}

export type ResultadoPush = 'enviado' | 'token_invalido' | 'erro' | 'stub'

export async function enviarPushFcm(params: {
  token: string
  titulo: string
  mensagem: string
  dados?: Record<string, unknown>
}): Promise<ResultadoPush> {
  const sa = serviceAccount()
  if (!sa) {
    console.log(`[push] stub (sem FCM_SERVICE_ACCOUNT_*): "${params.titulo}"`)
    return 'stub'
  }
  try {
    const res = await fetch(
      `https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${await accessToken(sa)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: params.token,
            notification: { title: params.titulo, body: params.mensagem },
            data: Object.fromEntries(
              Object.entries(params.dados ?? {}).map(([k, v]) => [k, String(v)])
            ),
            webpush: {
              notification: { icon: '/pwa-192.png', badge: '/pwa-192.png' },
              fcm_options: { link: '/' },
            },
          },
        }),
      }
    )
    if (res.ok) return 'enviado'
    const corpo = await res.text()
    // token expirado/removido pelo navegador → chamador deve apagar da base
    if (res.status === 404 || corpo.includes('UNREGISTERED') || corpo.includes('INVALID_ARGUMENT')) {
      return 'token_invalido'
    }
    console.error(`[push] FCM ${res.status}: ${corpo.slice(0, 300)}`)
    return 'erro'
  } catch (err) {
    console.error('[push] falha ao enviar', err)
    return 'erro'
  }
}
