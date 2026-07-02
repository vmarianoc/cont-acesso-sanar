import fp from 'fastify-plugin'
import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from 'fastify'
import type { JwtPayload } from '../types/common.js'

const PUBLIC_PATHS = ['/auth/', '/admin/', '/health', '/edge/']

const multiTenantPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request: FastifyRequest, reply: FastifyReply) => {
    const url = request.url
    const isPublic = PUBLIC_PATHS.some((p) => url.startsWith(p))
    if (isPublic) return

    try {
      await request.jwtVerify()
    } catch {
      return reply.status(401).send({
        erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Token inválido ou expirado' },
      })
    }

    const payload = request.user as JwtPayload

    if (!payload.schema_name || !payload.tenant_id) {
      return reply.status(401).send({
        erro: { codigo: 'TENANT_INVALIDO', mensagem: 'Token sem informações de tenant' },
      })
    }

    const schemaName = `tenant_${payload.tenant_id.replace(/-/g, '_')}`

    if (payload.schema_name !== schemaName) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Schema de tenant inválido' },
      })
    }

    const reserved = await fastify.db.reserve()
    await reserved.unsafe(`SET search_path TO ${schemaName}, public`)
    request.tenantDb = reserved
  })

  const releaseTenantDb = async (request: FastifyRequest) => {
    const reserved = request.tenantDb
    if (!reserved) return
    request.tenantDb = undefined
    try {
      await reserved.unsafe('SET search_path TO public')
    } catch {
      // ignore reset failures; connection is being returned to the pool
    }
    reserved.release()
  }

  fastify.addHook('onSend', async (request) => {
    await releaseTenantDb(request)
  })

  fastify.addHook('onResponse', async (request) => {
    await releaseTenantDb(request)
  })

  fastify.addHook('onError', async (request) => {
    await releaseTenantDb(request)
  })
}

export default fp(multiTenantPlugin, { name: 'multiTenant', dependencies: ['db', 'jwt'] })
