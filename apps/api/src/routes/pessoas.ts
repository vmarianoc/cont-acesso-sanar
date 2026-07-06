import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { registrarAuditoria } from '../services/auditoriaService.js'

const CreatePessoaBody = z.object({
  nome: z.string().min(2),
  cpf: z.string().optional(),
  rg: z.string().optional(),
  foto_url: z.string().url().optional(),
  tipo: z.enum(['morador', 'funcionario', 'visitante', 'prestador']),
})

const pessoasRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/pessoas', async (request, reply) => {
    const query = request.query as {
      ativo?: string
      tipo?: string
      sem_usuario?: string
      busca?: string
      page?: string
      limit?: string
    }
    const page = Math.max(1, parseInt(query.page ?? '1', 10))
    const limit = Math.min(100, parseInt(query.limit ?? '20', 10))
    const offset = (page - 1) * limit

    const conditions: string[] = []
    const params: any[] = []

    if (query.ativo !== undefined) {
      conditions.push(`p.ativo = $${params.push(query.ativo === 'true')}`)
    }
    if (query.tipo) {
      conditions.push(`p.tipo = $${params.push(query.tipo)}`)
    }
    if (query.sem_usuario === 'true') {
      conditions.push(`NOT EXISTS (SELECT 1 FROM usuarios_tenant ut WHERE ut.pessoa_id = p.id)`)
    }
    if (query.busca) {
      conditions.push(`p.nome ILIKE $${params.push('%' + query.busca + '%')}`)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = await request.tenantDb!.unsafe(
      `SELECT p.* FROM pessoas p ${where} ORDER BY p.nome LIMIT ${limit} OFFSET ${offset}`,
      params
    )

    return reply.status(200).send({ data: rows })
  })

  fastify.post('/pessoas', async (request, reply) => {
    const parsed = CreatePessoaBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const { nome, cpf, rg, foto_url, tipo } = parsed.data
    const id = uuidv4()

    const rows = await request.tenantDb!.unsafe(
      `INSERT INTO pessoas (id, nome, cpf, rg, foto_url, tipo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [id, nome, cpf ?? null, rg ?? null, foto_url ?? null, tipo]
    )

    await registrarAuditoria(request.tenantDb!, {
      usuario_id: (request.user as any).sub,
      acao: 'INSERT',
      tabela: 'pessoas',
      registro_id: id,
      dados_depois: rows[0] as Record<string, unknown>,
      ip: request.ip,
    })

    return reply.status(201).send({ data: rows[0] })
  })

  const UpdatePessoaBody = z.object({
    nome: z.string().min(2).optional(),
    email: z.string().email().nullable().optional(),
    telefone: z.string().nullable().optional(),
    ativo: z.boolean().optional(),
  })

  fastify.patch('/pessoas/:id', async (request, reply) => {
    const perfil = (request.user as any).perfil as string
    if (!['admin', 'sindico', 'superadmin'].includes(perfil)) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas síndico ou administrador editam pessoas' },
      })
    }
    const { id } = request.params as { id: string }
    const parsed = UpdatePessoaBody.safeParse(request.body)
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'Nada para atualizar' },
      })
    }
    const [antes] = await request.tenantDb!.unsafe(`SELECT * FROM pessoas WHERE id = $1`, [id])
    if (!antes) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADA', mensagem: 'Pessoa não encontrada' },
      })
    }
    const sets: string[] = ['atualizado_em = NOW()']
    const params: any[] = []
    for (const [campo, valor] of Object.entries(parsed.data)) {
      params.push(valor)
      sets.push(`${campo} = $${params.length}`)
    }
    params.push(id)
    const rows = await request.tenantDb!.unsafe(
      `UPDATE pessoas SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    )
    await registrarAuditoria(request.tenantDb!, {
      usuario_id: (request.user as any).sub,
      acao: 'pessoa.atualizar',
      tabela: 'pessoas',
      registro_id: id,
      dados_antes: antes,
      dados_depois: rows[0],
      ip: request.ip,
    })
    return reply.status(200).send({ data: rows[0] })
  })

  // Linha do tempo do "Cadastro Vivo": vínculos e mudanças registradas.
  fastify.get('/pessoas/:id/timeline', async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await request.tenantDb!.unsafe(
      `SELECT 'vinculo' AS tipo,
              'Vínculo ' || v.tipo_vinculo || ' na unidade ' || u.numero ||
                CASE WHEN v.ativo THEN ' (ativo)' ELSE ' (encerrado)' END AS descricao,
              v.inicio AS em
       FROM vinculos_unidade v JOIN unidades u ON u.id = v.unidade_id
       WHERE v.pessoa_id = $1
       UNION ALL
       SELECT 'historico' AS tipo, h.campo || ': ' || COALESCE(h.valor_antes,'—') || ' → ' ||
              COALESCE(h.valor_depois,'—') AS descricao, h.criado_em AS em
       FROM historico_pessoas h WHERE h.pessoa_id = $1
       ORDER BY em DESC LIMIT 50`,
      [id]
    )
    return reply.status(200).send({ data: rows })
  })
}

export default pessoasRoutes
