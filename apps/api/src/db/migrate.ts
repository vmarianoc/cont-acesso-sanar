import postgres from 'postgres'
import { readFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const MIGRATIONS_DIR = join(__dirname, 'migrations')

async function run() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 1 })

  console.log('Running public schema migrations...')

  const publicSql = await readFile(join(MIGRATIONS_DIR, '001_public_schema.sql'), 'utf-8')
  await sql.unsafe(publicSql)

  const alreadyApplied = await sql<{ nome: string }[]>`
    SELECT nome FROM public.migrations WHERE nome = '001_public_schema'
  `
  if (alreadyApplied.length === 0) {
    await sql`INSERT INTO public.migrations (nome) VALUES ('001_public_schema')`
  }

  console.log('Public schema ready.')

  console.log('Running tenant schema migrations...')

  const tenants = await sql<{ id: string; schema_name: string }[]>`
    SELECT id, schema_name FROM public.tenants WHERE ativo = true
  `

  const tenantSql = await readFile(join(MIGRATIONS_DIR, '002_tenant_schema.sql'), 'utf-8')

  for (const tenant of tenants) {
    console.log(`  Migrating tenant schema: ${tenant.schema_name}`)
    await sql.unsafe(`CREATE SCHEMA IF NOT EXISTS ${tenant.schema_name}`)
    await sql.unsafe(`SET search_path TO ${tenant.schema_name}, public`)
    await sql.unsafe(tenantSql)
    await sql.unsafe(`SET search_path TO public`)
    console.log(`  Done: ${tenant.schema_name}`)
  }

  console.log('All migrations applied.')
  await sql.end()
}

run().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
