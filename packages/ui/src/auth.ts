import client from './client'

export interface LoginPayload {
  email: string
  senha: string
  tenant_id: string
}

export async function apiLogin(payload: LoginPayload): Promise<{ token: string; perfil: string }> {
  const res = await client.post('/auth/login', payload)
  return res.data.data
}

export async function apiLogout(): Promise<void> {
  await client.post('/auth/logout')
}
