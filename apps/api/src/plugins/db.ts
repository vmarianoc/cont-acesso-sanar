import fp from 'fastify-plugin'
import postgres from 'postgres'
import type { FastifyPluginAsync } from 'fastify'

declare module 'fastify' {
  interface FastifyInstance {
    db: postgres.Sql
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

  fastify.addHook('onClose', async () => {
    await sql.end()
  })
}

export default fp(dbPlugin, { name: 'db' })
