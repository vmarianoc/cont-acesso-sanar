import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { registrarAuditoria } from '../services/auditoriaService.js'

const PERFIS_GESTAO = new Set(['admin', 'sindico', 'superadmin'])

const CreateGrupoBody = z.object({
  nome: z.string().min(2),
  descricao: z.string().optional(),
})

const MembroBody = z.object({ pessoa_id: z.string().uuid() })

const gruposRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.addHook('preHandler', async (request, reply) => {
    const perfil = (request.user as any).perfil as string
    if (!PERFIS_GESTAO.has(perfil)) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas síndico ou administrador gerenciam grupos' },
      })
    }
  })

  fastify.get('/grupos', async (request, reply) => {
    const rows = await request.tenantDb!.unsafe(
      `SELECT g.*,
              COALESCE(json_agg(json_build_object('pessoa_id', gm.pessoa_id, 'nome', p.nome))
                       FILTER (WHERE gm.pessoa_id IS NOT NULL), '[]') AS membros
       FROM grupos g
       LEFT JOIN grupo_membros gm ON gm.grupo_id = g.id
       LEFT JOIN pessoas p ON p.id = gm.pessoa_id
       GROUP BY g.id
       ORDER BY g.nome`
    )
    return reply.status(200).send({ data: rows })
  })

  fastify.post('/grupos', async (request, reply) => {
    const parsed = CreateGrupoBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    try {
      const rows = await request.tenantDb!.unsafe(
        `INSERT INTO grupos (id, nome, descricao) VALUES ($1, $2, $3) RETURNING *`,
        [uuidv4(), parsed.data.nome, parsed.data.descricao ?? null]
      )
      await registrarAuditoria(request.tenantDb!, {
        usuario_id: (request.user as any).sub,
        acao: 'grupo.criar',
        tabela: 'grupos',
        registro_id: rows[0].id,
        dados_depois: rows[0],
        ip: request.ip,
      })
      return reply.status(201).send({ data: rows[0] })
    } catch (err: any) {
      if (err.code === '23505') {
        return reply.status(409).send({
          erro: { codigo: 'GRUPO_DUPLICADO', mensagem: 'Já existe um grupo com esse nome' },
        })
      }
      throw err
    }
  })

  fastify.post('/grupos/:id/membros', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = MembroBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    await request.tenantDb!.unsafe(
      `INSERT INTO grupo_membros (grupo_id, pessoa_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, parsed.data.pessoa_id]
    )
    return reply.status(201).send({ data: { grupo_id: id, pessoa_id: parsed.data.pessoa_id } })
  })

  fastify.delete('/grupos/:id/membros/:pessoaId', async (request, reply) => {
    const { id, pessoaId } = request.params as { id: string; pessoaId: string }
    await request.tenantDb!.unsafe(
      `DELETE FROM grupo_membros WHERE grupo_id = $1 AND pessoa_id = $2`,
      [id, pessoaId]
    )
    return reply.status(200).send({ data: { removido: true } })
  })
}

export default gruposRoutes
