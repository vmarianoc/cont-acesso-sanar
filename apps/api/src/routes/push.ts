import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

const RegistrarTokenBody = z.object({
  token: z.string().min(10),
  plataforma: z.enum(['android', 'ios', 'web']),
})

const pushRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  // Registra (ou reativa, se já existir) o token de push do dispositivo do usuário autenticado.
  fastify.post('/push/tokens', async (request, reply) => {
    const parsed = RegistrarTokenBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { token, plataforma } = parsed.data
    const userId = (request.user as any).sub as string

    const rows = await request.tenantDb!.unsafe(
      `INSERT INTO dispositivos_push (id, pessoa_id, token, plataforma)
       SELECT $1, pessoa_id, $2, $3 FROM usuarios_tenant WHERE id = $4
       ON CONFLICT (token) DO UPDATE
         SET pessoa_id = EXCLUDED.pessoa_id, plataforma = EXCLUDED.plataforma, ativo = true
       RETURNING id, pessoa_id, plataforma, ativo`,
      [uuidv4(), token, plataforma, userId]
    )
    if (rows.length === 0) {
      return reply.status(400).send({
        erro: { codigo: 'USUARIO_INVALIDO', mensagem: 'Usuário sem pessoa vinculada' },
      })
    }

    return reply.status(201).send({ data: rows[0] })
  })

  // Remove (soft-delete) o token — chamado no logout ou ao desabilitar notificações.
  fastify.delete('/push/tokens/:token', async (request, reply) => {
    const { token } = request.params as { token: string }
    const rows = await request.tenantDb!.unsafe(
      `UPDATE dispositivos_push SET ativo = false WHERE token = $1 RETURNING id`,
      [token]
    )
    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Token não encontrado' },
      })
    }
    return reply.status(200).send({ data: { removido: true } })
  })
}

export default pushRoutes
