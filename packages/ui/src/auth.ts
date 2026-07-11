import client from './client'

export interface LoginPayload {
  /** E-mail ou CPF do usuário */
  identificador?: string
  /** compat: chamadas antigas por e-mail */
  email?: string
  senha: string
  /** opcional — sem ele a API descobre o condomínio pela credencial */
  tenant_id?: string
  /** login da portaria: código curto do condomínio */
  codigo_condominio?: string
  mfa_code?: string
}

export interface LoginResult {
  token: string
  perfil: string
  tenant_id: string
  condominio: string | null
  codigo_condominio: string | null
}

export interface ContaDisponivel {
  tenant_id: string
  condominio: string
}

/**
 * Autentica na API. Se a credencial valer em mais de um condomínio e nenhum
 * tenant for informado, lança ContasMultiplasError com a lista para o
 * seletor — reenvie com tenant_id escolhido.
 */
export class ContasMultiplasError extends Error {
  constructor(public contas: ContaDisponivel[]) {
    super('Escolha o condomínio')
  }
}

export async function apiLogin(payload: LoginPayload): Promise<LoginResult> {
  try {
    const res = await client.post('/auth/login', payload)
    return res.data.data
  } catch (err: any) {
    if (err.response?.status === 409 && err.response.data?.erro?.codigo === 'CONTAS_MULTIPLAS') {
      throw new ContasMultiplasError(err.response.data.data?.contas ?? [])
    }
    throw err
  }
}

export async function apiLogout(): Promise<void> {
  await client.post('/auth/logout')
}
