import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'

const TokenBody = z.object({
  token: z.string().min(20),
  plataforma: z.enum(['web', 'android', 'ios']).default('web'),
})

/** Registro do token de push (FCM) do dispositivo/navegador do usuário logado. */
const pushRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  const pessoaDoUsuario = async (request: any): Promise<string | null> => {
    const [u] = await request.tenantDb!.unsafe(
      `SELECT pessoa_id FROM usuarios_tenant WHERE id = $1`,
      [(request.user as any).sub]
    )
    return u?.pessoa_id ?? null
  }

  fastify.post('/push/token', async (request, reply) => {
    const parsed = TokenBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const pessoaId = await pessoaDoUsuario(request)
    if (!pessoaId) {
      return reply.status(400).send({
        erro: { codigo: 'SEM_PESSOA', mensagem: 'Usuário sem pessoa vinculada' },
      })
    }
    const [row] = await request.tenantDb!.unsafe(
      `INSERT INTO push_tokens (pessoa_id, token, plataforma)
       VALUES ($1, $2, $3)
       ON CONFLICT (token) DO UPDATE SET pessoa_id = EXCLUDED.pessoa_id, atualizado_em = NOW()
       RETURNING id, plataforma, criado_em`,
      [pessoaId, parsed.data.token, parsed.data.plataforma]
    )
    return reply.status(201).send({ data: row })
  })

  fastify.delete('/push/token', async (request, reply) => {
    const parsed = z.object({ token: z.string().min(20) }).safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'Informe o token' },
      })
    }
    await request.tenantDb!.unsafe(`DELETE FROM push_tokens WHERE token = $1`, [parsed.data.token])
    return reply.status(200).send({ data: { removido: true } })
  })
}

export default pushRoutes
