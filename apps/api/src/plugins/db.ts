import fp from 'fastify-plugin'
import postgres from 'postgres'
import type { FastifyPluginAsync } from 'fastify'

type ReservedSql = Awaited<ReturnType<postgres.Sql['reserve']>>

declare module 'fastify' {
  interface FastifyInstance {
    db: postgres.Sql
    withTenant: <T>(schemaName: string, fn: (sql: ReservedSql) => Promise<T>) => Promise<T>
  }
  interface FastifyRequest {
    tenantDb?: ReservedSql
  }
}

const dbPlugin: FastifyPluginAsync = async (fastify) => {
  const sql = postgres(process.env.DATABASE_URL!, {
    max: 20,
    idle_timeout: 30,
    connect_timeout: 10,
    onnotice: () => {},
  })

  await sql`SELECT 1`
  fastify.log.info('Database connected')

  fastify.decorate('db', sql)

  fastify.decorate('withTenant', async function <T>(
    schemaName: string,
    fn: (reserved: ReservedSql) => Promise<T>
  ): Promise<T> {
    const reserved = await sql.reserve()
    try {
      await reserved.unsafe(`SET search_path TO ${schemaName}, public`)
      return await fn(reserved)
    } finally {
      try {
        await reserved.unsafe('SET search_path TO public')
      } catch {
        // ignore reset failures; connection is being returned to the pool
      }
      reserved.release()
    }
  })

  fastify.addHook('onClose', async () => {
    await sql.end()
  })
}

export default fp(dbPlugin, { name: 'db' })
