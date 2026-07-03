import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { registrarAuditoria } from '../services/auditoriaService.js'
import { criarLiberacao } from '../services/acessoService.js'

const UpdatePerfilBody = z.object({
  nome: z.string().min(2).optional(),
  foto_url: z.string().url().optional(),
})

const CreateVeiculoBody = z.object({
  placa: z.string().min(6).max(8),
  modelo: z.string().optional(),
  cor: z.string().optional(),
})

const PreAutorizarVisitanteBody = z.object({
  nome: z.string().min(2),
  documento: z.string().optional(),
  unidade_id: z.string().uuid(),
  valido_de: z.string().datetime(),
  valido_ate: z.string().datetime(),
})

const moradorRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/morador/perfil', async (request, reply) => {
    const userId = (request as any).user.sub

    const rows = await request.tenantDb!.unsafe(
      `SELECT p.* FROM pessoas p
       INNER JOIN usuarios_tenant u ON u.pessoa_id = p.id
       WHERE u.id = $1 LIMIT 1`,
      [userId]
    )

    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Perfil não encontrado' },
      })
    }

    return reply.status(200).send({ data: rows[0] })
  })

  fastify.patch('/morador/perfil', async (request, reply) => {
    const userId = (request as any).user.sub
    const parsed = UpdatePerfilBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const updates: string[] = []
    const params: any[] = []

    if (parsed.data.nome) {
      updates.push(`nome = $${params.push(parsed.data.nome)}`)
    }
    if (parsed.data.foto_url) {
      updates.push(`foto_url = $${params.push(parsed.data.foto_url)}`)
    }

    if (updates.length === 0) {
      return reply.status(400).send({
        erro: { codigo: 'SEM_ALTERACOES', mensagem: 'Nenhum campo para atualizar' },
      })
    }

    updates.push(`atualizado_em = NOW()`)

    const rows = await request.tenantDb!.unsafe(
      `UPDATE pessoas SET ${updates.join(', ')}
       WHERE id = (SELECT pessoa_id FROM usuarios_tenant WHERE id = $${params.push(userId)})
       RETURNING *`,
      params
    )

    return reply.status(200).send({ data: rows[0] })
  })

  fastify.get('/morador/veiculos', async (request, reply) => {
    const userId = (request as any).user.sub

    const rows = await request.tenantDb!.unsafe(
      `SELECT v.* FROM veiculos v
       INNER JOIN usuarios_tenant u ON u.pessoa_id = v.pessoa_id
       WHERE u.id = $1 AND v.ativo = true`,
      [userId]
    )

    return reply.status(200).send({ data: rows })
  })

  fastify.post('/morador/veiculos', async (request, reply) => {
    const userId = (request as any).user.sub
    const parsed = CreateVeiculoBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const { placa, modelo, cor } = parsed.data
    const id = uuidv4()

    const rows = await request.tenantDb!.unsafe(
      `INSERT INTO veiculos (id, pessoa_id, placa, modelo, cor)
       SELECT $1, pessoa_id, $2, $3, $4 FROM usuarios_tenant WHERE id = $5
       RETURNING *`,
      [id, placa.toUpperCase(), modelo ?? null, cor ?? null, userId]
    )

    await registrarAuditoria(request.tenantDb!, {
      usuario_id: userId,
      acao: 'INSERT',
      tabela: 'veiculos',
      registro_id: id,
      dados_depois: rows[0] as Record<string, unknown>,
      ip: request.ip,
    })

    return reply.status(201).send({ data: rows[0] })
  })

  fastify.get('/morador/visitantes/pre-autorizar', async (request, reply) => {
    const userId = (request as any).user.sub

    const rows = await request.tenantDb!.unsafe(
      `SELECT v.* FROM visitantes v
       INNER JOIN usuarios_tenant u ON u.id = $1
       WHERE v.pre_autorizado_por = u.pessoa_id
       ORDER BY v.criado_em DESC`,
      [userId]
    )

    return reply.status(200).send({ data: rows })
  })

  fastify.post('/morador/visitantes/pre-autorizar', async (request, reply) => {
    const userId = (request as any).user.sub
    const parsed = PreAutorizarVisitanteBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const { nome, documento, unidade_id, valido_de, valido_ate } = parsed.data
    const id = uuidv4()

    const rows = await request.tenantDb!.unsafe(
      `INSERT INTO visitantes (id, nome, documento, unidade_id, pre_autorizado_por, valido_de, valido_ate)
       SELECT $1, $2, $3, $4, pessoa_id, $5, $6 FROM usuarios_tenant WHERE id = $7
       RETURNING *`,
      [id, nome, documento ?? null, unidade_id, valido_de, valido_ate, userId]
    )

    if (rows[0]) {
      // Pré-autorização gera liberação facial temporária na portaria,
      // limitada à janela informada pelo morador.
      await criarLiberacao(request.tenantDb!, {
        visitante_id: id,
        area: 'portaria',
        valido_de,
        valido_ate,
        origem_tipo: 'visitante',
        origem_id: id,
      })
    }

    return reply.status(201).send({ data: rows[0] })
  })
}

export default moradorRoutes
