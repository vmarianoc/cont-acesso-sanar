import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { login, refresh } from '../services/authService.js'

const LoginBody = z.object({
  email: z.string().email(),
  senha: z.string().min(6),
  tenant_id: z.string().uuid(),
})

const authRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post('/auth/login', async (request, reply) => {
    const parsed = LoginBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const { email, senha, tenant_id } = parsed.data
    const payload = await login(fastify.db, email, senha, tenant_id)

    if (!payload) {
      return reply.status(401).send({
        erro: { codigo: 'CREDENCIAIS_INVALIDAS', mensagem: 'Email, senha ou tenant inválidos' },
      })
    }

    const token = fastify.jwt.sign(payload)
    const refreshToken = fastify.jwt.sign(
      { sub: payload.sub, tenant_id: payload.tenant_id, schema_name: payload.schema_name },
      { expiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d' }
    )

    reply.setCookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 60 * 60 * 24 * 7,
    })

    return reply.status(200).send({ data: { token, perfil: payload.perfil } })
  })

  fastify.post('/auth/refresh', async (request, reply) => {
    const refreshToken = request.cookies?.refreshToken
    if (!refreshToken) {
      return reply.status(401).send({
        erro: { codigo: 'SEM_REFRESH_TOKEN', mensagem: 'Refresh token não encontrado' },
      })
    }

    let decoded: any
    try {
      decoded = fastify.jwt.verify(refreshToken)
    } catch {
      return reply.status(401).send({
        erro: { codigo: 'REFRESH_INVALIDO', mensagem: 'Refresh token inválido ou expirado' },
      })
    }

    const payload = await refresh(
      fastify.db,
      decoded.sub,
      decoded.tenant_id,
      decoded.schema_name
    )

    if (!payload) {
      return reply.status(401).send({
        erro: { codigo: 'USUARIO_INATIVO', mensagem: 'Usuário inativo ou não encontrado' },
      })
    }

    const token = fastify.jwt.sign(payload)
    return reply.status(200).send({ data: { token } })
  })

  fastify.post('/auth/logout', async (request, reply) => {
    reply.clearCookie('refreshToken', { path: '/auth/refresh' })
    return reply.status(200).send({ data: { mensagem: 'Logout realizado com sucesso' } })
  })
}

export default authRoutes
