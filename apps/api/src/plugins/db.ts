import fp from 'fastify-plugin'
import postgres from 'postgres'
import type { FastifyPluginAsync } from 'fastify'
import { withTenant } from '../services/tenantDb.js'

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

  fastify.decorate('withTenant', function <T>(
    schemaName: string,
    fn: (reserved: ReservedSql) => Promise<T>
  ): Promise<T> {
    return withTenant(sql, schemaName, fn)
  })

  fastify.addHook('onClose', async () => {
    await sql.end({ timeout: 5 })
  })
}

export default fp(dbPlugin, { name: 'db' })
