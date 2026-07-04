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
    const [espaco] = await db.unsafe(
      `SELECT area, periodos, exige_aprovacao, antecedencia_max_dias, limite_mensal_por_unidade
       FROM espacos WHERE id = $1 AND ativo = true`,
      [espaco_id]
    )
    if (!espaco) {
      return reply.status(404).send({
        erro: { codigo: 'ESPACO_INEXISTENTE', mensagem: 'Espaço não encontrado' },
      })
    }

    // Regras: data futura dentro da antecedência máxima
    const hoje = new Date(new Date().toISOString().slice(0, 10))
    const dia = new Date(data)
    const diffDias = Math.round((dia.getTime() - hoje.getTime()) / 86_400_000)
    if (diffDias < 0) {
      return reply.status(400).send({
        erro: { codigo: 'DATA_PASSADA', mensagem: 'Não é possível reservar datas passadas' },
      })
    }
    if (diffDias > espaco.antecedencia_max_dias) {
      return reply.status(400).send({
        erro: {
          codigo: 'ANTECEDENCIA_EXCEDIDA',
          mensagem: `Reservas com no máximo ${espaco.antecedencia_max_dias} dias de antecedência`,
        },
      })
    }

    // Período precisa existir na configuração do espaço
    const periodos: { nome: string; inicio: string; fim: string }[] = espaco.periodos ?? []
    const faixa = periodo ? periodos.find((p) => p.nome === periodo) : periodos[0]
    if (!faixa) {
      return reply.status(400).send({
        erro: {
          codigo: 'PERIODO_INVALIDO',
          mensagem: `Períodos disponíveis: ${periodos.map((p) => p.nome).join(', ')}`,
        },
      })
    }

    const ocupado = await db.unsafe(
      `SELECT id FROM reservas
       WHERE espaco_id = $1 AND data = $2 AND COALESCE(periodo,'') = $3 AND status <> 'cancelada'`,
      [espaco_id, data, faixa.nome]
    )
    if (ocupado.length > 0) {
      return reply.status(409).send({
        erro: { codigo: 'ESPACO_OCUPADO', mensagem: 'Espaço já reservado nesta data e período' },
      })
    }

    // Limite mensal por unidade
    if (ctx.unidade_id) {
      const [{ c }] = await db.unsafe(
        `SELECT count(*)::int AS c FROM reservas r
         JOIN vinculos_unidade v ON v.pessoa_id = r.pessoa_id AND v.ativo = true
         WHERE r.espaco_id = $1 AND v.unidade_id = $2 AND r.status <> 'cancelada'
           AND date_trunc('month', r.data) = date_trunc('month', $3::date)`,
        [espaco_id, ctx.unidade_id, data]
      )
      if (c >= espaco.limite_mensal_por_unidade) {
        return reply.status(409).send({
          erro: {
            codigo: 'LIMITE_MENSAL',
            mensagem: `Limite de ${espaco.limite_mensal_por_unidade} reserva(s) deste espaço por mês atingido`,
          },
        })
      }
    }

    const status = espaco.exige_aprovacao ? 'pendente' : 'confirmada'
    const rows = await db.unsafe(
      `INSERT INTO reservas (id, espaco_id, pessoa_id, data, periodo, status)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [uuidv4(), espaco_id, ctx.pessoa_id, data, faixa.nome, status]
    )

    if (espaco.exige_aprovacao) {
      // Entra na central de aprovações do síndico (fluxo Cadastro Vivo).
      await db.unsafe(
        `INSERT INTO aprovacoes (id, tipo, pessoa_id, unidade_id, dados, status)
         VALUES ($1, 'reserva_espaco', $2, $3, $4, 'pendente')`,
        [uuidv4(), ctx.pessoa_id, ctx.unidade_id, db.json({ reserva_id: rows[0].id, data, periodo: faixa.nome }) as any]
      )
    } else if (espaco.area) {
      // Liberação facial restrita à faixa horária do período reservado.
      await criarLiberacao(db, {
        pessoa_id: ctx.pessoa_id,
        area: espaco.area,
        valido_de: `${data}T${faixa.inicio}:00`,
        valido_ate: `${data}T${faixa.fim}:00`,
        origem_tipo: 'reserva',
        origem_id: rows[0].id,
      })
    }

    return reply.status(201).send({ data: rows[0] })
  })

  fastify.delete('/morador/reservas/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const db = request.tenantDb!
    const ctx = await contextoMorador(db, (request.user as any).sub)
    if (!ctx) {
      return reply.status(404).send({ erro: { codigo: 'SEM_PERFIL', mensagem: 'Sem perfil de morador' } })
    }
    const rows = await db.unsafe(
      `UPDATE reservas SET status = 'cancelada'
       WHERE id = $1 AND pessoa_id = $2 AND status <> 'cancelada' AND data >= CURRENT_DATE
       RETURNING *`,
      [id, ctx.pessoa_id]
    )
    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADA', mensagem: 'Reserva não encontrada ou já passada' },
      })
    }
    // Revoga a liberação facial gerada pela reserva.
    await db.unsafe(
      `UPDATE liberacoes_acesso SET ativo = false WHERE origem_tipo = 'reserva' AND origem_id = $1`,
      [id]
    )
    return reply.status(200).send({ data: rows[0] })
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
