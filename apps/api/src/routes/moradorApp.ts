import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { criarLiberacao } from '../services/acessoService.js'

interface Contexto {
  pessoa_id: string
  nome: string
  unidade_id: string | null
  unidade_numero: string | null
  bloco: string | null
  condominio: string | null
}

async function contextoMorador(db: any, userId: string): Promise<Contexto | null> {
  const rows = await db.unsafe(
    `SELECT p.id AS pessoa_id, p.nome,
            u.id AS unidade_id, u.numero AS unidade_numero,
            b.nome AS bloco, c.nome AS condominio
     FROM usuarios_tenant ut
     JOIN pessoas p ON p.id = ut.pessoa_id
     LEFT JOIN vinculos_unidade v ON v.pessoa_id = p.id AND v.ativo = true
     LEFT JOIN unidades u ON u.id = v.unidade_id
     LEFT JOIN blocos b ON b.id = u.bloco_id
     LEFT JOIN condominios c ON c.id = b.condominio_id
     WHERE ut.id = $1
     ORDER BY v.principal DESC NULLS LAST
     LIMIT 1`,
    [userId]
  )
  return rows[0] ?? null
}

const CreateReservaBody = z.object({
  espaco_id: z.string().uuid(),
  data: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  periodo: z.string().optional(),
})

const DecidirSolicitacaoBody = z.object({
  status: z.enum(['liberado', 'recusado']),
})

const moradorAppRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/morador/resumo', async (request, reply) => {
    const db = request.tenantDb!
    const ctx = await contextoMorador(db, (request.user as any).sub)
    if (!ctx) {
      return reply.status(404).send({
        erro: { codigo: 'SEM_PERFIL', mensagem: 'Usuário não está vinculado a um morador' },
      })
    }

    const [enc, sol] = await Promise.all([
      db.unsafe(
        `SELECT count(*) AS c FROM encomendas WHERE pessoa_id = $1 AND status = 'aguardando'`,
        [ctx.pessoa_id]
      ),
      ctx.unidade_id
        ? db.unsafe(
            `SELECT count(*) AS c FROM solicitacoes_acesso WHERE unidade_id = $1 AND status = 'pendente'`,
            [ctx.unidade_id]
          )
        : Promise.resolve([{ c: '0' }]),
    ])

    return reply.status(200).send({
      data: {
        nome: ctx.nome,
        unidade: ctx.unidade_numero,
        bloco: ctx.bloco,
        condominio: ctx.condominio,
        encomendas_aguardando: Number(enc[0].c),
        visitantes_aguardando: Number(sol[0].c),
      },
    })
  })

  fastify.get('/morador/encomendas', async (request, reply) => {
    const db = request.tenantDb!
    const ctx = await contextoMorador(db, (request.user as any).sub)
    if (!ctx) return reply.status(200).send({ data: [] })
    const rows = await db.unsafe(
      `SELECT * FROM encomendas WHERE pessoa_id = $1 ORDER BY (status = 'aguardando') DESC, recebida_em DESC`,
      [ctx.pessoa_id]
    )
    return reply.status(200).send({ data: rows })
  })

  fastify.get('/espacos', async (request, reply) => {
    const rows = await request.tenantDb!.unsafe(
      `SELECT * FROM espacos WHERE ativo = true ORDER BY nome`
    )
    return reply.status(200).send({ data: rows })
  })

  fastify.get('/morador/reservas', async (request, reply) => {
    const db = request.tenantDb!
    const ctx = await contextoMorador(db, (request.user as any).sub)
    if (!ctx) return reply.status(200).send({ data: [] })
    const rows = await db.unsafe(
      `SELECT r.*, e.nome AS espaco_nome
       FROM reservas r JOIN espacos e ON e.id = r.espaco_id
       WHERE r.pessoa_id = $1 ORDER BY r.data DESC`,
      [ctx.pessoa_id]
    )
    return reply.status(200).send({ data: rows })
  })

  fastify.post('/morador/reservas', async (request, reply) => {
    const parsed = CreateReservaBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const db = request.tenantDb!
    const ctx = await contextoMorador(db, (request.user as any).sub)
    if (!ctx) {
      return reply.status(404).send({ erro: { codigo: 'SEM_PERFIL', mensagem: 'Sem perfil de morador' } })
    }

    const { espaco_id, data, periodo } = parsed.data
    const ocupado = await db.unsafe(
      `SELECT id FROM reservas WHERE espaco_id = $1 AND data = $2 AND status <> 'cancelada'`,
      [espaco_id, data]
    )
    if (ocupado.length > 0) {
      return reply.status(409).send({
        erro: { codigo: 'ESPACO_OCUPADO', mensagem: 'Espaço já reservado nesta data' },
      })
    }

    const rows = await db.unsafe(
      `INSERT INTO reservas (id, espaco_id, pessoa_id, data, periodo, status)
       VALUES ($1, $2, $3, $4, $5, 'confirmada') RETURNING *`,
      [uuidv4(), espaco_id, ctx.pessoa_id, data, periodo ?? null]
    )

    // Agendamento gera liberação facial temporária para a área do espaço
    // (dia inteiro da reserva), consumida pelo Edge em /edge/validate-access.
    const [espaco] = await db.unsafe(`SELECT area FROM espacos WHERE id = $1`, [espaco_id])
    if (espaco?.area) {
      await criarLiberacao(db, {
        pessoa_id: ctx.pessoa_id,
        area: espaco.area,
        valido_de: `${data}T00:00:00Z`,
        valido_ate: `${data}T23:59:59Z`,
        origem_tipo: 'reserva',
        origem_id: rows[0].id,
      })
    }

    return reply.status(201).send({ data: rows[0] })
  })

  fastify.get('/morador/solicitacoes', async (request, reply) => {
    const db = request.tenantDb!
    const ctx = await contextoMorador(db, (request.user as any).sub)
    if (!ctx || !ctx.unidade_id) return reply.status(200).send({ data: [] })
    const rows = await db.unsafe(
      `SELECT * FROM solicitacoes_acesso
       WHERE unidade_id = $1 ORDER BY (status = 'pendente') DESC, criado_em DESC LIMIT 20`,
      [ctx.unidade_id]
    )
    return reply.status(200).send({ data: rows })
  })

  fastify.patch('/morador/solicitacoes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = DecidirSolicitacaoBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const db = request.tenantDb!
    const ctx = await contextoMorador(db, (request.user as any).sub)
    if (!ctx || !ctx.unidade_id) {
      return reply.status(404).send({ erro: { codigo: 'SEM_PERFIL', mensagem: 'Sem perfil de morador' } })
    }

    const rows = await db.unsafe(
      `UPDATE solicitacoes_acesso
       SET status = $1, decidido_por = $2, decidido_em = NOW()
       WHERE id = $3 AND unidade_id = $4 AND status = 'pendente'
       RETURNING *`,
      [parsed.data.status, ctx.pessoa_id, id, ctx.unidade_id]
    )
    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Solicitação pendente não encontrada' },
      })
    }

    // Portaria vê a decisão do morador em tempo real.
    await fastify.publishRt((request.user as any).schema_name, ['perfil:porteiro'], {
      tipo: 'solicitacao_decidida',
      dados: { id, status: parsed.data.status, nome: rows[0].nome, por: ctx.nome },
    })

    return reply.status(200).send({ data: rows[0] })
  })
}

export default moradorAppRoutes
