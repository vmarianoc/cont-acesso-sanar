import fp from 'fastify-plugin'
import fastifyJwt from '@fastify/jwt'
import fastifyCookie from '@fastify/cookie'
import type { FastifyPluginAsync } from 'fastify'

const jwtPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(fastifyCookie)

  await fastify.register(fastifyJwt, {
    secret: process.env.JWT_SECRET!,
    sign: {
      expiresIn: process.env.JWT_EXPIRES_IN ?? '15m',
    },
    cookie: {
      cookieName: 'refreshToken',
      signed: false,
    },
  })

  fastify.decorate('authenticate', async function (request: any, reply: any) {
    try {
      await request.jwtVerify()
    } catch (err) {
      reply.status(401).send({
        erro: { codigo: 'NAO_AUTENTICADO', mensagem: 'Token inválido ou expirado' },
      })
    }
  })
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: any, reply: any) => Promise<void>
  }
}

export default fp(jwtPlugin, { name: 'jwt', dependencies: ['db'] })
