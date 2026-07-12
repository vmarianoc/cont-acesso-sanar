import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { registrarAuditoria } from '../services/auditoriaService.js'
import { PERFIS_GESTAO } from '../lib/perfis.js'

const CreateComunicadoBody = z.object({
  titulo: z.string().min(2),
  corpo: z.string().min(2),
  prioridade: z.enum(['normal', 'urgente']).default('normal'),
})

async function pessoaDoUsuario(db: any, userId: string): Promise<string | null> {
  const [row] = await db.unsafe(`SELECT pessoa_id FROM usuarios_tenant WHERE id = $1`, [userId])
  return row?.pessoa_id ?? null
}

const comunicadosRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  // Lista com estado de leitura do usuário e contagem total de leituras.
  fastify.get('/comunicados', async (request, reply) => {
    const userId = (request.user as any).sub as string
    const pessoaId = await pessoaDoUsuario(request.tenantDb!, userId)
    const rows = await request.tenantDb!.unsafe(
      `SELECT c.*,
              (SELECT COUNT(*)::int FROM comunicado_leituras l WHERE l.comunicado_id = c.id) AS leituras,
              EXISTS (
                SELECT 1 FROM comunicado_leituras l
                WHERE l.comunicado_id = c.id AND l.pessoa_id = $1
              ) AS lido
       FROM comunicados c
       ORDER BY c.criado_em DESC
       LIMIT 100`,
      [pessoaId]
    )
    return reply.status(200).send({ data: rows })
  })

  fastify.post('/comunicados', async (request, reply) => {
    const perfil = (request.user as any).perfil as string
    if (!PERFIS_GESTAO.has(perfil)) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas síndico ou administrador publicam comunicados' },
      })
    }
    const parsed = CreateComunicadoBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const userId = (request.user as any).sub as string
    const schema = (request.user as any).schema_name as string
    const { titulo, corpo, prioridade } = parsed.data

    const rows = await request.tenantDb!.unsafe(
      `INSERT INTO comunicados (id, titulo, corpo, prioridade, publicado_por)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [uuidv4(), titulo, corpo, prioridade, userId]
    )

    // Notificação persistida para todos os moradores com vínculo ativo.
    await request.tenantDb!.unsafe(
      `INSERT INTO notificacoes (id, pessoa_id, titulo, mensagem, tipo)
       SELECT uuid_generate_v4(), v.pessoa_id, $1, $2, 'comunicado'
       FROM (SELECT DISTINCT pessoa_id FROM vinculos_unidade WHERE ativo = true) v`,
      [`Comunicado: ${titulo}`, corpo.slice(0, 200)]
    )

    await fastify.publishRt(schema, ['perfil:morador'], {
      tipo: 'comunicado_publicado',
      dados: { id: rows[0].id, titulo, prioridade },
    })

    await registrarAuditoria(request.tenantDb!, {
      usuario_id: userId,
      acao: 'comunicado.publicar',
      tabela: 'comunicados',
      registro_id: rows[0].id,
      dados_depois: rows[0],
      ip: request.ip,
    })
    return reply.status(201).send({ data: rows[0] })
  })

  fastify.post('/comunicados/:id/lida', async (request, reply) => {
    const { id } = request.params as { id: string }
    const pessoaId = await pessoaDoUsuario(request.tenantDb!, (request.user as any).sub)
    if (!pessoaId) {
      return reply.status(400).send({
        erro: { codigo: 'SEM_PESSOA', mensagem: 'Usuário sem pessoa vinculada' },
      })
    }
    await request.tenantDb!.unsafe(
      `INSERT INTO comunicado_leituras (comunicado_id, pessoa_id)
       VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [id, pessoaId]
    )
    return reply.status(200).send({ data: { lido: true } })
  })

  fastify.delete('/comunicados/:id', async (request, reply) => {
    const perfil = (request.user as any).perfil as string
    if (!PERFIS_GESTAO.has(perfil)) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas síndico ou administrador removem comunicados' },
      })
    }
    const { id } = request.params as { id: string }
    const rows = await request.tenantDb!.unsafe(
      `DELETE FROM comunicados WHERE id = $1 RETURNING *`,
      [id]
    )
    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Comunicado não encontrado' },
      })
    }
    await registrarAuditoria(request.tenantDb!, {
      usuario_id: (request.user as any).sub,
      acao: 'comunicado.remover',
      tabela: 'comunicados',
      registro_id: id,
      dados_antes: rows[0],
      ip: request.ip,
    })
    return reply.status(200).send({ data: rows[0] })
  })
}

export default comunicadosRoutes
