import bcrypt from 'bcryptjs'
import postgres from 'postgres'
import { authenticator } from 'otplib'
import type { JwtPayload } from '../types/common.js'

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10)
const MFA_PERFIS = new Set(['admin', 'sindico'])

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export type LoginResult =
  | { ok: true; payload: JwtPayload }
  | { ok: false; code: 'CREDENCIAIS_INVALIDAS' | 'MFA_REQUERIDO' | 'MFA_INVALIDO' }

interface TenantUser {
  id: string
  senha_hash: string
  perfil: string
  ativo: boolean
  mfa_secret: string | null
  mfa_ativo: boolean
}

export async function login(
  sql: postgres.Sql,
  email: string,
  senha: string,
  tenantId: string,
  mfaCode?: string
): Promise<LoginResult> {
  const tenant = await sql<{ id: string; schema_name: string; ativo: boolean }[]>`
    SELECT id, schema_name, ativo FROM public.tenants WHERE id = ${tenantId} LIMIT 1
  `

  if (!tenant[0] || !tenant[0].ativo) return { ok: false, code: 'CREDENCIAIS_INVALIDAS' }

  const schemaName = tenant[0].schema_name

  const reserved = await sql.reserve()
  let user: TenantUser | undefined
  try {
    await reserved.unsafe(`SET search_path TO ${schemaName}, public`)
    const users = await reserved.unsafe<TenantUser[]>(
      `SELECT id, senha_hash, perfil, ativo, mfa_secret, mfa_ativo
       FROM usuarios_tenant WHERE email = $1 LIMIT 1`,
      [email]
    )
    user = users[0]
  } finally {
    try {
      await reserved.unsafe('SET search_path TO public')
    } catch {
      // ignore reset failures
    }
    reserved.release()
  }

  if (!user || !user.ativo) return { ok: false, code: 'CREDENCIAIS_INVALIDAS' }

  const valid = await verifyPassword(senha, user.senha_hash)
  if (!valid) return { ok: false, code: 'CREDENCIAIS_INVALIDAS' }

  if (MFA_PERFIS.has(user.perfil) && user.mfa_ativo && user.mfa_secret) {
    if (!mfaCode) return { ok: false, code: 'MFA_REQUERIDO' }
    if (!authenticator.check(mfaCode, user.mfa_secret)) {
      return { ok: false, code: 'MFA_INVALIDO' }
    }
  }

  return {
    ok: true,
    payload: {
      sub: user.id,
      tenant_id: tenantId,
      perfil: user.perfil,
      schema_name: schemaName,
    },
  }
}

export async function refresh(
  sql: postgres.Sql,
  userId: string,
  tenantId: string,
  schemaName: string
): Promise<JwtPayload | null> {
  const reserved = await sql.reserve()
  let user: { id: string; perfil: string; ativo: boolean } | undefined
  try {
    await reserved.unsafe(`SET search_path TO ${schemaName}, public`)
    const users = await reserved.unsafe<{ id: string; perfil: string; ativo: boolean }[]>(
      `SELECT id, perfil, ativo FROM usuarios_tenant WHERE id = $1 LIMIT 1`,
      [userId]
    )
    user = users[0]
  } finally {
    try {
      await reserved.unsafe('SET search_path TO public')
    } catch {
      // ignore reset failures
    }
    reserved.release()
  }

  if (!user || !user.ativo) return null

  return {
    sub: user.id,
    tenant_id: tenantId,
    perfil: user.perfil,
    schema_name: schemaName,
  }
}
