import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { registrarAuditoria } from '../services/auditoriaService.js'

const PERFIS_GESTAO = new Set(['admin', 'sindico', 'superadmin', 'porteiro'])

const CreateEncomendaBody = z.object({
  unidade_id: z.string().uuid(),
  pessoa_id: z.string().uuid().optional(),
  remetente: z.string().min(1),
  descricao: z.string().optional(),
  prateleira: z.string().optional(),
})

const RetirarBody = z.object({
  codigo_retirada: z.string().min(1),
})

const gerarCodigo = () => String(Math.floor(1000 + Math.random() * 9000))

const encomendasRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.addHook('preHandler', async (request, reply) => {
    const perfil = (request.user as any).perfil as string
    if (!PERFIS_GESTAO.has(perfil)) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Sem permissão para gerenciar encomendas' },
      })
    }
  })

  fastify.get('/encomendas', async (request, reply) => {
    const query = request.query as { status?: string; busca?: string }
    const conds: string[] = ['true']
    const params: any[] = []
    if (query.status) {
      params.push(query.status)
      conds.push(`e.status = $${params.length}`)
    }
    if (query.busca) {
      params.push(`%${query.busca}%`)
      conds.push(`(e.remetente ILIKE $${params.length} OR p.nome ILIKE $${params.length} OR u.numero ILIKE $${params.length})`)
    }
    const rows = await request.tenantDb!.unsafe(
      `SELECT e.*, p.nome AS pessoa_nome, u.numero AS unidade_numero
       FROM encomendas e
       LEFT JOIN pessoas p ON p.id = e.pessoa_id
       LEFT JOIN unidades u ON u.id = e.unidade_id
       WHERE ${conds.join(' AND ')}
       ORDER BY e.status = 'aguardando' DESC, e.recebida_em DESC
       LIMIT 200`,
      params
    )
    return reply.status(200).send({ data: rows })
  })

  fastify.post('/encomendas', async (request, reply) => {
    const parsed = CreateEncomendaBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { unidade_id, pessoa_id, remetente, descricao, prateleira } = parsed.data
    const userId = (request.user as any).sub as string

    // Sem pessoa explícita, a encomenda vai para o responsável (principal) da unidade.
    let destinatario = pessoa_id ?? null
    if (!destinatario) {
      const [principal] = await request.tenantDb!.unsafe(
        `SELECT pessoa_id FROM vinculos_unidade
         WHERE unidade_id = $1 AND ativo = true
         ORDER BY principal DESC, inicio ASC LIMIT 1`,
        [unidade_id]
      )
      destinatario = principal?.pessoa_id ?? null
    }

    const rows = await request.tenantDb!.unsafe(
      `INSERT INTO encomendas (id, pessoa_id, unidade_id, remetente, descricao, prateleira, codigo_retirada)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [uuidv4(), destinatario, unidade_id, remetente, descricao ?? null, prateleira ?? null, gerarCodigo()]
    )

    if (destinatario) {
      await request.tenantDb!.unsafe(
        `INSERT INTO notificacoes (id, pessoa_id, titulo, mensagem, tipo)
         VALUES ($1, $2, 'Encomenda na portaria', $3, 'encomenda')`,
        [uuidv4(), destinatario, `Chegou uma encomenda de ${remetente}. Código de retirada: ${rows[0].codigo_retirada}`]
      )
      await fastify.publishRt((request.user as any).schema_name, [`pessoa:${destinatario}`], {
        tipo: 'encomenda_recebida',
        dados: { id: rows[0].id, remetente },
      })
    }

    await registrarAuditoria(request.tenantDb!, {
      usuario_id: userId,
      acao: 'encomenda.registrar',
      tabela: 'encomendas',
      registro_id: rows[0].id,
      dados_depois: rows[0],
      ip: request.ip,
    })
    return reply.status(201).send({ data: rows[0] })
  })

  fastify.patch('/encomendas/:id/retirar', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = RetirarBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const [encomenda] = await request.tenantDb!.unsafe(
      `SELECT * FROM encomendas WHERE id = $1`,
      [id]
    )
    if (!encomenda) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADA', mensagem: 'Encomenda não encontrada' },
      })
    }
    if (encomenda.status === 'retirada') {
      return reply.status(409).send({
        erro: { codigo: 'JA_RETIRADA', mensagem: 'Encomenda já foi retirada' },
      })
    }
    if (encomenda.codigo_retirada && encomenda.codigo_retirada !== parsed.data.codigo_retirada) {
      return reply.status(403).send({
        erro: { codigo: 'CODIGO_INVALIDO', mensagem: 'Código de retirada não confere' },
      })
    }

    const userId = (request.user as any).sub as string
    const rows = await request.tenantDb!.unsafe(
      `UPDATE encomendas SET status = 'retirada', retirada_em = NOW() WHERE id = $1 RETURNING *`,
      [id]
    )
    await registrarAuditoria(request.tenantDb!, {
      usuario_id: userId,
      acao: 'encomenda.retirar',
      tabela: 'encomendas',
      registro_id: id,
      dados_antes: encomenda,
      dados_depois: rows[0],
      ip: request.ip,
    })
    return reply.status(200).send({ data: rows[0] })
  })
}

export default encomendasRoutes
