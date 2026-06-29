import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { createTenant, getTenants } from '../services/tenantService.js'

const CreateTenantBody = z.object({
  nome: z.string().min(2),
  plano: z.enum(['basico', 'profissional', 'enterprise']),
})

const tenantsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/admin/tenants', async (request, reply) => {
    const payload = (request as any).user
    if (payload.perfil !== 'superadmin') {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas superadmins podem listar tenants' },
      })
    }

    const tenants = await getTenants(fastify.db)
    return reply.status(200).send({ data: tenants })
  })

  fastify.post('/admin/tenants', async (request, reply) => {
    const payload = (request as any).user
    if (payload.perfil !== 'superadmin') {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas superadmins podem criar tenants' },
      })
    }

    const parsed = CreateTenantBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const tenant = await createTenant(fastify.db, parsed.data.nome, parsed.data.plano)
    return reply.status(201).send({ data: tenant })
  })
}

export default tenantsRoutes
