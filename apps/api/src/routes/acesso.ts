import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { criarLiberacao, validarAcessoFacial, registrarEventoAcesso } from '../services/acessoService.js'
import { registrarAuditoria } from '../services/auditoriaService.js'

const PERFIS_GESTAO = new Set(['admin', 'sindico', 'superadmin', 'porteiro'])

const ValidateAccessBody = z.object({
  schema_name: z.string(),
  dispositivo_id: z.string().uuid(),
  pessoa_id: z.string().uuid().optional(),
  visitante_id: z.string().uuid().optional(),
  metodo: z.enum(['facial', 'qrcode', 'biometria']).default('facial'),
})

const CreateLiberacaoBody = z.object({
  pessoa_id: z.string().uuid().optional(),
  visitante_id: z.string().uuid().optional(),
  area: z.string().min(1),
  metodo: z.enum(['facial', 'qrcode', 'biometria', 'manual']).default('facial'),
  valido_de: z.string().datetime(),
  valido_ate: z.string().datetime(),
  recorrencia: z
    .object({
      dias: z.array(z.number().min(1).max(7)).min(1),
      hora_inicio: z.string().regex(/^\d{2}:\d{2}$/),
      hora_fim: z.string().regex(/^\d{2}:\d{2}$/),
    })
    .optional(),
}).refine((b) => b.pessoa_id || b.visitante_id, { message: 'Informe pessoa_id ou visitante_id' })

const acessoRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  /**
   * Validação de acesso pelo Edge (leitor facial da área). Nunca é bloqueante
   * para o hardware: em caso de dúvida o Edge decide localmente (modo degradado).
   */
  fastify.post('/edge/validate-access', async (request, reply) => {
    const parsed = ValidateAccessBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { schema_name, dispositivo_id, pessoa_id, visitante_id, metodo } = parsed.data

    const resultado = await fastify.withTenant(schema_name, async (sql) => {
      const validacao = await validarAcessoFacial(sql, { dispositivo_id, pessoa_id, visitante_id })
      if (validacao.motivo !== 'DISPOSITIVO_DESCONHECIDO') {
        await registrarEventoAcesso(sql, {
          dispositivo_id,
          pessoa_id,
          resultado: validacao.resultado,
          metodo,
        })
      }
      return validacao
    })

    return reply.status(200).send({ data: resultado })
  })

  // ---- Gestão de liberações (admin/síndico/porteiro) ----
  const exigirGestao = (request: any, reply: any) => {
    const perfil = request.user.perfil as string
    if (!PERFIS_GESTAO.has(perfil)) {
      reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Sem permissão para gerenciar liberações' },
      })
      return false
    }
    return true
  }

  fastify.get('/liberacoes', async (request, reply) => {
    if (!exigirGestao(request, reply)) return
    const query = request.query as { area?: string; vigentes?: string }
    const conds: string[] = ['l.ativo = true']
    const params: any[] = []
    if (query.area) {
      params.push(query.area)
      conds.push(`l.area = $${params.length}`)
    }
    if (query.vigentes === 'true') conds.push('NOW() BETWEEN l.valido_de AND l.valido_ate')

    const rows = await request.tenantDb!.unsafe(
      `SELECT l.*, p.nome AS pessoa_nome, v.nome AS visitante_nome
       FROM liberacoes_acesso l
       LEFT JOIN pessoas p ON p.id = l.pessoa_id
       LEFT JOIN visitantes v ON v.id = l.visitante_id
       WHERE ${conds.join(' AND ')}
       ORDER BY l.valido_ate DESC
       LIMIT 200`,
      params
    )
    return reply.status(200).send({ data: rows })
  })

  fastify.post('/liberacoes', async (request, reply) => {
    if (!exigirGestao(request, reply)) return
    const parsed = CreateLiberacaoBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const userId = (request.user as any).sub as string
    const liberacao = await criarLiberacao(request.tenantDb!, {
      ...parsed.data,
      origem_tipo: 'manual',
      criado_por: userId,
    })
    await registrarAuditoria(request.tenantDb!, {
      usuario_id: userId,
      acao: 'liberacao_acesso.criar',
      tabela: 'liberacoes_acesso',
      registro_id: liberacao.id,
      dados_depois: liberacao,
      ip: request.ip,
    })
    return reply.status(201).send({ data: liberacao })
  })

  fastify.delete('/liberacoes/:id', async (request, reply) => {
    if (!exigirGestao(request, reply)) return
    const { id } = request.params as { id: string }
    const userId = (request.user as any).sub as string
    const rows = await request.tenantDb!.unsafe(
      `UPDATE liberacoes_acesso SET ativo = false WHERE id = $1 AND ativo = true RETURNING *`,
      [id]
    )
    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADA', mensagem: 'Liberação não encontrada' },
      })
    }
    await registrarAuditoria(request.tenantDb!, {
      usuario_id: userId,
      acao: 'liberacao_acesso.revogar',
      tabela: 'liberacoes_acesso',
      registro_id: id,
      dados_depois: rows[0],
      ip: request.ip,
    })
    return reply.status(200).send({ data: rows[0] })
  })
}

export default acessoRoutes
