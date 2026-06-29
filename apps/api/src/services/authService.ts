import bcrypt from 'bcryptjs'
import postgres from 'postgres'
import type { JwtPayload } from '../types/common.js'

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS ?? '12', 10)

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

export async function login(
  sql: postgres.Sql,
  email: string,
  senha: string,
  tenantId: string
): Promise<JwtPayload | null> {
  const tenant = await sql<
    { id: string; schema_name: string; ativo: boolean }[]
  >`SELECT id, schema_name, ativo FROM public.tenants WHERE id = ${tenantId} LIMIT 1`

  if (!tenant[0] || !tenant[0].ativo) return null

  const schemaName = tenant[0].schema_name

  await sql.unsafe(`SET search_path TO ${schemaName}, public`)

  const users = await sql<
    { id: string; senha_hash: string; perfil: string; ativo: boolean }[]
  >`SELECT id, senha_hash, perfil, ativo FROM usuarios_tenant WHERE email = ${email} LIMIT 1`

  await sql.unsafe(`SET search_path TO public`)

  const user = users[0]
  if (!user || !user.ativo) return null

  const valid = await verifyPassword(senha, user.senha_hash)
  if (!valid) return null

  return {
    sub: user.id,
    tenant_id: tenantId,
    perfil: user.perfil,
    schema_name: schemaName,
  }
}

export async function refresh(
  sql: postgres.Sql,
  userId: string,
  tenantId: string,
  schemaName: string
): Promise<JwtPayload | null> {
  await sql.unsafe(`SET search_path TO ${schemaName}, public`)

  const users = await sql<
    { id: string; perfil: string; ativo: boolean }[]
  >`SELECT id, perfil, ativo FROM usuarios_tenant WHERE id = ${userId} LIMIT 1`

  await sql.unsafe(`SET search_path TO public`)

  const user = users[0]
  if (!user || !user.ativo) return null

  return {
    sub: user.id,
    tenant_id: tenantId,
    perfil: user.perfil,
    schema_name: schemaName,
  }
}
