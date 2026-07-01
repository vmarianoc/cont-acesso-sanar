import postgres from 'postgres'
import { v4 as uuidv4 } from 'uuid'
import type { Tenant } from '../types/common.js'
import { readFile, readdir } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const MIGRATIONS_DIR = join(__dirname, '../db/migrations')

export function getSchemaName(tenantId: string): string {
  return `tenant_${tenantId.replace(/-/g, '_')}`
}

async function loadTenantMigrations(): Promise<string[]> {
  const files = await readdir(MIGRATIONS_DIR)
  const tenantFiles = files
    .filter((f) => f.endsWith('.sql') && f !== '001_public_schema.sql')
    .sort()
  return Promise.all(tenantFiles.map((f) => readFile(join(MIGRATIONS_DIR, f), 'utf-8')))
}

export async function createTenant(
  sql: postgres.Sql,
  nome: string,
  plano: string
): Promise<Tenant> {
  const id = uuidv4()
  const schemaName = getSchemaName(id)

  const migrations = await loadTenantMigrations()

  await sql.begin(async (tx) => {
    await tx`
      INSERT INTO public.tenants (id, nome, schema_name, plano)
      VALUES (${id}, ${nome}, ${schemaName}, ${plano})
    `

    await tx.unsafe(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`)
    await tx.unsafe(`SET search_path TO ${schemaName}, public`)
    for (const migration of migrations) {
      await tx.unsafe(migration)
    }
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
