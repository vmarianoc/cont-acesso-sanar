import postgres from 'postgres'
import { v4 as uuidv4 } from 'uuid'
import type { Tenant } from '../types/common.js'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export function getSchemaName(tenantId: string): string {
  return `tenant_${tenantId.replace(/-/g, '_')}`
}

export async function createTenant(
  sql: postgres.Sql,
  nome: string,
  plano: string
): Promise<Tenant> {
  const id = uuidv4()
  const schemaName = getSchemaName(id)

  const tenantSqlPath = join(__dirname, '../db/migrations/002_tenant_schema.sql')
  const tenantSql = await readFile(tenantSqlPath, 'utf-8')

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO public.tenants (id, nome, schema_name, plano)
      VALUES (${id}, ${nome}, ${schemaName}, ${plano})
    `

    await tx.unsafe(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`)
    await tx.unsafe(`SET search_path TO ${schemaName}, public`)
    await tx.unsafe(tenantSql)
    await tx.unsafe(`SET search_path TO public`)
  })

  const rows = await sql<Tenant[]>`
    SELECT * FROM public.tenants WHERE id = ${id} LIMIT 1
  `

  return rows[0]
}

export async function getTenants(sql: postgres.Sql): Promise<Tenant[]> {
  return sql<Tenant[]>`SELECT * FROM public.tenants ORDER BY criado_em DESC`
}

export async function getTenantById(
  sql: postgres.Sql,
  id: string
): Promise<Tenant | null> {
  const rows = await sql<Tenant[]>`
    SELECT * FROM public.tenants WHERE id = ${id} LIMIT 1
  `
  return rows[0] ?? null
}
