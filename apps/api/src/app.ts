import Fastify from 'fastify'
import fastifyMultipart from '@fastify/multipart'
import { randomUUID } from 'node:crypto'

import dbPlugin from './plugins/db.js'
import redisPlugin from './plugins/redis.js'
import jwtPlugin from './plugins/jwt.js'
import rateLimitPlugin from './plugins/rateLimit.js'
import multiTenantPlugin from './plugins/multiTenant.js'
import realtimePlugin from './plugins/realtime.js'

import authRoutes from './routes/auth.js'
import tenantsRoutes from './routes/tenants.js'
import pessoasRoutes from './routes/pessoas.js'
import aprovacoesRoutes from './routes/aprovacoes.js'
import moradorRoutes from './routes/morador.js'
import moradorAppRoutes from './routes/moradorApp.js'
import edgeSyncRoutes from './routes/edgeSync.js'
import edgeLicenseRoutes from './routes/edgeLicense.js'
import eventosRoutes from './routes/eventos.js'
import usuariosRoutes from './routes/usuarios.js'
import condominiosRoutes from './routes/condominios.js'
import blocosRoutes from './routes/blocos.js'
import unidadesRoutes from './routes/unidades.js'
import acessoRoutes from './routes/acesso.js'
import encomendasRoutes from './routes/encomendas.js'
import dispositivosRoutes from './routes/dispositivos.js'
import solicitacoesRoutes from './routes/solicitacoes.js'
import comunicadosRoutes from './routes/comunicados.js'
import documentosRoutes from './routes/documentos.js'
import gruposRoutes from './routes/grupos.js'
import contaRoutes from './routes/conta.js'
import ocorrenciasRoutes from './routes/ocorrencias.js'
import buscaRoutes from './routes/busca.js'

export async function buildApp() {
  const fastify = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport:
        process.env.NODE_ENV !== 'production'
          ? { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss Z' } }
          : undefined,
    },
    genReqId: () => randomUUID(),
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
  })

  fastify.addHook('onSend', async (request, reply) => {
    reply.header('X-Request-ID', request.id)
  })

  await fastify.register(fastifyMultipart, {
    limits: { fileSize: 25 * 1024 * 1024 },
  })

  await fastify.register(dbPlugin)
  await fastify.register(redisPlugin)
  await fastify.register(jwtPlugin)
  await fastify.register(rateLimitPlugin)
  await fastify.register(multiTenantPlugin)
  await fastify.register(realtimePlugin)

  fastify.get('/health', async () => ({ status: 'ok', ts: new Date().toISOString() }))

  await fastify.register(authRoutes)
  await fastify.register(tenantsRoutes)
  await fastify.register(pessoasRoutes)
  await fastify.register(aprovacoesRoutes)
  await fastify.register(moradorRoutes)
  await fastify.register(moradorAppRoutes)
  await fastify.register(edgeSyncRoutes)
  await fastify.register(edgeLicenseRoutes)
  await fastify.register(eventosRoutes)
  await fastify.register(usuariosRoutes)
  await fastify.register(condominiosRoutes)
  await fastify.register(blocosRoutes)
  await fastify.register(unidadesRoutes)
  await fastify.register(acessoRoutes)
  await fastify.register(encomendasRoutes)
  await fastify.register(dispositivosRoutes)
  await fastify.register(solicitacoesRoutes)
  await fastify.register(comunicadosRoutes)
  await fastify.register(documentosRoutes)
  await fastify.register(gruposRoutes)
  await fastify.register(contaRoutes)
  await fastify.register(ocorrenciasRoutes)
  await fastify.register(buscaRoutes)

  fastify.setErrorHandler((error, request, reply) => {
    fastify.log.error({ err: error, requestId: request.id }, 'Unhandled error')
    reply.status(error.statusCode ?? 500).send({
      erro: {
        codigo: 'ERRO_INTERNO',
        mensagem:
          process.env.NODE_ENV === 'production' ? 'Erro interno do servidor' : error.message,
      },
    })
  })

  return fastify
}
