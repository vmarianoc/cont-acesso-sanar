import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'

const PERFIS_PORTARIA = new Set(['porteiro', 'admin', 'sindico', 'superadmin'])

const MensagemBody = z.object({ texto: z.string().min(1).max(2000) })

/**
 * Chat portaria ↔ morador, uma conversa por unidade.
 * Morador só enxerga a conversa das unidades em que tem vínculo ativo;
 * a portaria vê todas. Entrega em tempo real via SSE.
 */
const chatRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  const contexto = async (request: any) => {
    const user = request.user as { sub: string; perfil: string; schema_name: string }
    const [eu] = await request.tenantDb!.unsafe(
      `SELECT ut.pessoa_id, COALESCE(p.nome, ut.email) AS nome
       FROM usuarios_tenant ut LEFT JOIN pessoas p ON p.id = ut.pessoa_id
       WHERE ut.id = $1`,
      [user.sub]
    )
    return { user, pessoaId: eu?.pessoa_id ?? null, nome: eu?.nome ?? 'Usuário' }
  }

  const podeAcessarUnidade = async (request: any, unidadeId: string) => {
    const { user, pessoaId } = await contexto(request)
    if (PERFIS_PORTARIA.has(user.perfil)) return true
    if (!pessoaId) return false
    const [v] = await request.tenantDb!.unsafe(
      `SELECT id FROM vinculos_unidade WHERE pessoa_id = $1 AND unidade_id = $2 AND ativo = true`,
      [pessoaId, unidadeId]
    )
    return Boolean(v)
  }

  // Portaria: todas as conversas (última mensagem por unidade).
  // Morador: apenas as unidades com vínculo ativo.
  fastify.get('/chat/conversas', async (request, reply) => {
    const { user, pessoaId } = await contexto(request)
    const ehPortaria = PERFIS_PORTARIA.has(user.perfil)
    const rows = await request.tenantDb!.unsafe(
      `SELECT DISTINCT ON (m.unidade_id)
              m.unidade_id, u.numero AS unidade_numero, m.texto AS ultima_mensagem,
              m.origem, m.criado_em
       FROM chat_mensagens m
       JOIN unidades u ON u.id = m.unidade_id
       ${ehPortaria ? '' : `JOIN vinculos_unidade v ON v.unidade_id = m.unidade_id AND v.ativo = true AND v.pessoa_id = $1`}
       ORDER BY m.unidade_id, m.criado_em DESC`,
      ehPortaria ? [] : [pessoaId]
    )
    rows.sort((a: any, b: any) => new Date(b.criado_em).getTime() - new Date(a.criado_em).getTime())
    return reply.status(200).send({ data: rows })
  })

  fastify.get('/chat/:unidadeId/mensagens', async (request, reply) => {
    const { unidadeId } = request.params as { unidadeId: string }
    if (!(await podeAcessarUnidade(request, unidadeId))) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Sem acesso a esta conversa' },
      })
    }
    const rows = await request.tenantDb!.unsafe(
      `SELECT * FROM chat_mensagens WHERE unidade_id = $1 ORDER BY criado_em ASC LIMIT 200`,
      [unidadeId]
    )
    return reply.status(200).send({ data: rows })
  })

  fastify.post('/chat/:unidadeId/mensagens', async (request, reply) => {
    const { unidadeId } = request.params as { unidadeId: string }
    const parsed = MensagemBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    if (!(await podeAcessarUnidade(request, unidadeId))) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Sem acesso a esta conversa' },
      })
    }
    const { user, nome } = await contexto(request)
    const origem = PERFIS_PORTARIA.has(user.perfil) ? 'portaria' : 'morador'

    const rows = await request.tenantDb!.unsafe(
      `INSERT INTO chat_mensagens (id, unidade_id, autor_id, autor_nome, origem, texto)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [uuidv4(), unidadeId, user.sub, nome, origem, parsed.data.texto]
    )

    // tempo real: portaria sempre; moradores da unidade quando a portaria fala
    const canais = ['perfil:porteiro']
    if (origem === 'portaria') {
      const moradores = await request.tenantDb!.unsafe(
        `SELECT pessoa_id FROM vinculos_unidade WHERE unidade_id = $1 AND ativo = true`,
        [unidadeId]
      )
      for (const m of moradores) canais.push(`pessoa:${m.pessoa_id}`)
    }
    await fastify.publishRt(user.schema_name, canais, {
      tipo: 'chat_mensagem',
      dados: { unidade_id: unidadeId, origem, texto: parsed.data.texto.slice(0, 120) },
    })

    return reply.status(201).send({ data: rows[0] })
  })
}

export default chatRoutes
