import fp from 'fastify-plugin'
import fastifyRateLimit from '@fastify/rate-limit'
import type { FastifyPluginAsync } from 'fastify'

const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyRateLimit, {
    global: true,
    max: 200,
    timeWindow: '1 minute',
    redis: fastify.redis,
    keyGenerator: (request) => {
      const user = (request as any).user
      if (user?.tenant_id) return `rl:${user.tenant_id}:${request.ip}`
      return `rl:${request.ip}`
    },
    errorResponseBuilder: () => ({
      erro: {
        codigo: 'LIMITE_REQUISICOES',
        mensagem: 'Muitas requisições. Tente novamente em breve.',
      },
    }),
  })
}

export default fp(rateLimitPlugin, { name: 'rateLimit', dependencies: ['redis'] })
