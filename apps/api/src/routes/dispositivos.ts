import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { registrarAuditoria } from '../services/auditoriaService.js'
import { PERFIS_GESTAO } from '../lib/perfis.js'

const TIPOS = ['catraca', 'cancela', 'leitor_facial', 'leitor_qrcode', 'interfone', 'lpr', 'camera'] as const

const CreateDispositivoBody = z.object({
  nome: z.string().min(2),
  tipo: z.enum(TIPOS),
  area: z.string().min(1),
  local: z.string().optional(),
  condominio_id: z.string().uuid().optional(),
})

const UpdateDispositivoBody = z.object({
  nome: z.string().min(2).optional(),
  area: z.string().min(1).optional(),
  local: z.string().optional(),
  ativo: z.boolean().optional(),
})

const dispositivosRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  // Leitura liberada para qualquer perfil autenticado (a portaria usa a lista
  // para registrar eventos manuais); mutações só para síndico/admin.
  fastify.addHook('preHandler', async (request, reply) => {
    if (request.method === 'GET') return
    const perfil = (request.user as any).perfil as string
    if (!PERFIS_GESTAO.has(perfil)) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas síndico ou administrador gerenciam dispositivos' },
      })
    }
  })

  fastify.get('/dispositivos', async (request, reply) => {
    const rows = await request.tenantDb!.unsafe(
      `SELECT d.*, c.nome AS condominio_nome
       FROM dispositivos d
       LEFT JOIN condominios c ON c.id = d.condominio_id
       ORDER BY d.ativo DESC, d.area, d.nome`
    )
    return reply.status(200).send({ data: rows })
  })

  fastify.post('/dispositivos', async (request, reply) => {
    const parsed = CreateDispositivoBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { nome, tipo, area, local, condominio_id } = parsed.data

    let condominioId = condominio_id ?? null
    if (!condominioId) {
      const [c] = await request.tenantDb!.unsafe(`SELECT id FROM condominios LIMIT 1`)
      condominioId = c?.id ?? null
    }

    const rows = await request.tenantDb!.unsafe(
      `INSERT INTO dispositivos (id, nome, tipo, area, local, condominio_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [uuidv4(), nome, tipo, area, local ?? null, condominioId]
    )
    await registrarAuditoria(request.tenantDb!, {
      usuario_id: (request.user as any).sub,
      acao: 'dispositivo.criar',
      tabela: 'dispositivos',
      registro_id: rows[0].id,
      dados_depois: rows[0],
      ip: request.ip,
    })
    return reply.status(201).send({ data: rows[0] })
  })

  fastify.patch('/dispositivos/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateDispositivoBody.safeParse(request.body)
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'Nada para atualizar' },
      })
    }
    const [antes] = await request.tenantDb!.unsafe(`SELECT * FROM dispositivos WHERE id = $1`, [id])
    if (!antes) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Dispositivo não encontrado' },
      })
    }

    const sets: string[] = []
    const params: any[] = []
    for (const [campo, valor] of Object.entries(parsed.data)) {
      params.push(valor)
      sets.push(`${campo} = $${params.length}`)
    }
    params.push(id)
    const rows = await request.tenantDb!.unsafe(
      `UPDATE dispositivos SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params
    )
    await registrarAuditoria(request.tenantDb!, {
      usuario_id: (request.user as any).sub,
      acao: 'dispositivo.atualizar',
      tabela: 'dispositivos',
      registro_id: id,
      dados_antes: antes,
      dados_depois: rows[0],
      ip: request.ip,
    })
    return reply.status(200).send({ data: rows[0] })
  })
}

export default dispositivosRoutes
