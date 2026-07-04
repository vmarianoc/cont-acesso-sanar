import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { registrarAuditoria } from '../services/auditoriaService.js'

const PERFIS_PORTARIA = new Set(['porteiro', 'admin', 'sindico', 'superadmin'])

const CreateSolicitacaoBody = z.object({
  nome: z.string().min(2),
  documento: z.string().optional(),
  tipo: z.string().default('visita'),
  unidade_id: z.string().uuid(),
})

const solicitacoesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.addHook('preHandler', async (request, reply) => {
    const perfil = (request.user as any).perfil as string
    if (!PERFIS_PORTARIA.has(perfil)) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Sem permissão para solicitações de acesso' },
      })
    }
  })

  fastify.get('/solicitacoes', async (request, reply) => {
    const query = request.query as { status?: string }
    const params: any[] = []
    let cond = 'true'
    if (query.status) {
      params.push(query.status)
      cond = `s.status = $1`
    }
    const rows = await request.tenantDb!.unsafe(
      `SELECT s.*, u.numero AS unidade_numero
       FROM solicitacoes_acesso s
       JOIN unidades u ON u.id = s.unidade_id
       WHERE ${cond}
       ORDER BY s.criado_em DESC LIMIT 100`,
      params
    )
    return reply.status(200).send({ data: rows })
  })

  /**
   * Portaria chama o morador: cria a solicitação, notifica o responsável da
   * unidade e emite evento em tempo real para o app do morador.
   */
  fastify.post('/solicitacoes', async (request, reply) => {
    const parsed = CreateSolicitacaoBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { nome, documento, tipo, unidade_id } = parsed.data
    const userId = (request.user as any).sub as string
    const schema = (request.user as any).schema_name as string

    const rows = await request.tenantDb!.unsafe(
      `INSERT INTO solicitacoes_acesso (id, nome, documento, tipo, unidade_id, criado_por)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [uuidv4(), nome, documento ?? null, tipo, unidade_id, userId]
    )
    const solicitacao = rows[0]

    const moradores = await request.tenantDb!.unsafe(
      `SELECT pessoa_id FROM vinculos_unidade
       WHERE unidade_id = $1 AND ativo = true
       ORDER BY principal DESC, inicio ASC`,
      [unidade_id]
    )
    for (const m of moradores) {
      await request.tenantDb!.unsafe(
        `INSERT INTO notificacoes (id, pessoa_id, titulo, mensagem, tipo)
         VALUES ($1, $2, 'Visitante na portaria', $3, 'solicitacao_acesso')`,
        [uuidv4(), m.pessoa_id, `${nome} aguarda liberação na portaria.`]
      )
      await fastify.publishRt(schema, [`pessoa:${m.pessoa_id}`], {
        tipo: 'solicitacao_acesso',
        dados: { id: solicitacao.id, nome, tipo },
      })
    }

    await registrarAuditoria(request.tenantDb!, {
      usuario_id: userId,
      acao: 'solicitacao_acesso.criar',
      tabela: 'solicitacoes_acesso',
      registro_id: solicitacao.id,
      dados_depois: solicitacao,
      ip: request.ip,
    })
    return reply.status(201).send({ data: solicitacao })
  })
}

export default solicitacoesRoutes
