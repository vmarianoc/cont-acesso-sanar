import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { registrarAuditoria } from '../services/auditoriaService.js'

const PERFIS_GESTAO = new Set(['admin', 'sindico', 'superadmin'])

const CreateOcorrenciaBody = z.object({
  titulo: z.string().min(2),
  descricao: z.string().min(2),
  categoria: z.enum(['barulho', 'manutencao', 'seguranca', 'outros']).default('outros'),
  unidade_id: z.string().uuid().optional(),
})

const UpdateOcorrenciaBody = z.object({
  status: z.enum(['aberta', 'em_andamento', 'resolvida']).optional(),
  comentario: z.string().min(1).optional(),
}).refine((b) => b.status || b.comentario, { message: 'Informe status ou comentário' })

const ocorrenciasRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/ocorrencias', async (request, reply) => {
    const perfil = (request.user as any).perfil as string
    const userId = (request.user as any).sub as string
    const query = request.query as { status?: string }
    const conds: string[] = []
    const params: any[] = []

    // morador vê apenas as próprias ocorrências; gestão/portaria vê tudo
    if (perfil === 'morador') {
      params.push(userId)
      conds.push(`o.aberto_por = $${params.length}`)
    }
    if (query.status) {
      params.push(query.status)
      conds.push(`o.status = $${params.length}`)
    }

    const rows = await request.tenantDb!.unsafe(
      `SELECT o.*, u.numero AS unidade_numero,
              COALESCE(json_agg(json_build_object('texto', c.texto, 'criado_em', c.criado_em)
                       ORDER BY c.criado_em)
                       FILTER (WHERE c.id IS NOT NULL), '[]') AS comentarios
       FROM ocorrencias o
       LEFT JOIN unidades u ON u.id = o.unidade_id
       LEFT JOIN ocorrencia_comentarios c ON c.ocorrencia_id = o.id
       ${conds.length ? `WHERE ${conds.join(' AND ')}` : ''}
       GROUP BY o.id, u.numero
       ORDER BY (o.status <> 'resolvida') DESC, o.criado_em DESC
       LIMIT 100`,
      params
    )
    return reply.status(200).send({ data: rows })
  })

  fastify.post('/ocorrencias', async (request, reply) => {
    const parsed = CreateOcorrenciaBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const userId = (request.user as any).sub as string
    const schema = (request.user as any).schema_name as string
    const { titulo, descricao, categoria, unidade_id } = parsed.data

    const rows = await request.tenantDb!.unsafe(
      `INSERT INTO ocorrencias (id, titulo, descricao, categoria, unidade_id, aberto_por)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [uuidv4(), titulo, descricao, categoria, unidade_id ?? null, userId]
    )

    await fastify.publishRt(schema, ['perfil:sindico'], {
      tipo: 'ocorrencia_aberta',
      dados: { id: rows[0].id, titulo, categoria },
    })
    await registrarAuditoria(request.tenantDb!, {
      usuario_id: userId,
      acao: 'ocorrencia.abrir',
      tabela: 'ocorrencias',
      registro_id: rows[0].id,
      dados_depois: rows[0],
      ip: request.ip,
    })
    return reply.status(201).send({ data: rows[0] })
  })

  fastify.patch('/ocorrencias/:id', async (request, reply) => {
    const perfil = (request.user as any).perfil as string
    if (!PERFIS_GESTAO.has(perfil)) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas síndico ou administrador tratam ocorrências' },
      })
    }
    const parsed = UpdateOcorrenciaBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { id } = request.params as { id: string }
    const userId = (request.user as any).sub as string
    const schema = (request.user as any).schema_name as string

    const [antes] = await request.tenantDb!.unsafe(`SELECT * FROM ocorrencias WHERE id = $1`, [id])
    if (!antes) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADA', mensagem: 'Ocorrência não encontrada' },
      })
    }

    let atual = antes
    if (parsed.data.status) {
      const rows = await request.tenantDb!.unsafe(
        `UPDATE ocorrencias
         SET status = $1, resolvido_em = CASE WHEN $1 = 'resolvida' THEN NOW() ELSE resolvido_em END
         WHERE id = $2 RETURNING *`,
        [parsed.data.status, id]
      )
      atual = rows[0]
      if (parsed.data.status === 'resolvida' && antes.aberto_por) {
        const [autor] = await request.tenantDb!.unsafe(
          `SELECT pessoa_id FROM usuarios_tenant WHERE id = $1`,
          [antes.aberto_por]
        )
        if (autor?.pessoa_id) {
          await fastify.publishRt(schema, [`pessoa:${autor.pessoa_id}`], {
            tipo: 'ocorrencia_resolvida',
            dados: { id, titulo: antes.titulo },
          })
        }
      }
    }
    if (parsed.data.comentario) {
      await request.tenantDb!.unsafe(
        `INSERT INTO ocorrencia_comentarios (id, ocorrencia_id, autor, texto) VALUES ($1, $2, $3, $4)`,
        [uuidv4(), id, userId, parsed.data.comentario]
      )
    }

    await registrarAuditoria(request.tenantDb!, {
      usuario_id: userId,
      acao: 'ocorrencia.atualizar',
      tabela: 'ocorrencias',
      registro_id: id,
      dados_antes: antes,
      dados_depois: atual,
      ip: request.ip,
    })
    return reply.status(200).send({ data: atual })
  })
}

export default ocorrenciasRoutes
