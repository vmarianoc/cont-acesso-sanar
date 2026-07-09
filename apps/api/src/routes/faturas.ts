import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { emitirCobrancaCora, PRECO_PLANO_CENTAVOS } from '../services/coraService.js'

const GerarFaturaBody = z.object({
  tenant_id: z.string().uuid(),
  competencia: z.string().regex(/^\d{4}-\d{2}$/), // YYYY-MM
  valor_centavos: z.number().int().positive().optional(), // default: preço do plano
  dias_vencimento: z.number().int().min(1).max(90).default(10),
})

const BaixaManualBody = z.object({
  observacao: z.string().optional(),
})

/**
 * Billing da administradora, ligado à licença: fatura mensal por tenant
 * emitida no Banco Cora (boleto/Pix). O pagamento — por webhook da Cora ou
 * baixa manual — estende a validade da licença em 1 mês.
 */
const faturasRoutes: FastifyPluginAsync = async (fastify) => {
  const marcarPaga = async (
    faturaId: string,
    metodo: string,
    baixadoPor: string | null
  ): Promise<Record<string, any> | null> => {
    const rows = await fastify.db.unsafe(
      `UPDATE faturas
       SET status = 'paga', pago_em = NOW(), metodo_pagamento = $2, baixa_manual_por = $3
       WHERE id = $1 AND status = 'aberta' RETURNING *`,
      [faturaId, metodo, baixadoPor]
    )
    if (rows.length === 0) return null
    const fatura = rows[0]
    // Pagamento estende a licença em 1 mês a partir do maior entre hoje e a validade atual.
    await fastify.db.unsafe(
      `UPDATE licencas
       SET validade = GREATEST(COALESCE(validade, NOW()), NOW()) + INTERVAL '1 month',
           ativo = true
       WHERE tenant_id = $1`,
      [fatura.tenant_id]
    ).catch(async () => {
      await fastify.db.unsafe(
        `UPDATE licencas
         SET validade = GREATEST(COALESCE(validade, NOW()), NOW()) + INTERVAL '1 month'
         WHERE tenant_id = $1`,
        [fatura.tenant_id]
      )
    })
    return fatura
  }

  // ---- Webhook público da Cora (pagamento confirmado) ----
  fastify.post('/webhooks/cora', async (request, reply) => {
    const segredo = process.env.CORA_WEBHOOK_SECRET
    if (!segredo || request.headers['x-webhook-secret'] !== segredo) {
      return reply.status(401).send({ erro: { codigo: 'WEBHOOK_NAO_AUTORIZADO', mensagem: 'Segredo inválido' } })
    }
    const body = request.body as { event?: string; invoice_id?: string }
    if (body?.event !== 'invoice.paid' || !body.invoice_id) {
      return reply.status(200).send({ data: { ignorado: true } })
    }
    const [fatura] = await fastify.db.unsafe(
      `SELECT id FROM faturas WHERE cora_invoice_id = $1 AND status = 'aberta'`,
      [body.invoice_id]
    )
    if (!fatura) return reply.status(200).send({ data: { ignorado: true } })
    await marcarPaga(fatura.id, 'cora', null)
    request.log.info({ fatura: fatura.id }, 'fatura paga via webhook Cora')
    return reply.status(200).send({ data: { paga: true } })
  })

  // ---- Painel da administradora (superadmin) ----
  fastify.register(async (admin) => {
    admin.addHook('onRequest', fastify.authenticate)
    admin.addHook('preHandler', async (request, reply) => {
      if ((request.user as any).perfil !== 'superadmin') {
        return reply.status(403).send({
          erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Billing exclusivo da administradora' },
        })
      }
    })

    admin.get('/admin/faturas', async (request, reply) => {
      const query = request.query as { tenant_id?: string; status?: string }
      const conds: string[] = ['true']
      const params: any[] = []
      if (query.tenant_id) {
        params.push(query.tenant_id)
        conds.push(`f.tenant_id = $${params.length}`)
      }
      if (query.status) {
        params.push(query.status)
        conds.push(`f.status = $${params.length}`)
      }
      const rows = await fastify.db.unsafe(
        `SELECT f.*, t.nome AS condominio
         FROM faturas f JOIN tenants t ON t.id = f.tenant_id
         WHERE ${conds.join(' AND ')}
         ORDER BY f.status = 'aberta' DESC, f.vencimento DESC
         LIMIT 200`,
        params
      )
      return reply.status(200).send({ data: rows })
    })

    admin.post('/admin/faturas', async (request, reply) => {
      const parsed = GerarFaturaBody.safeParse(request.body)
      if (!parsed.success) {
        return reply.status(400).send({
          erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
        })
      }
      const { tenant_id, competencia, dias_vencimento } = parsed.data

      const [tenant] = await fastify.db.unsafe(
        `SELECT id, nome, plano FROM tenants WHERE id = $1`,
        [tenant_id]
      )
      if (!tenant) {
        return reply.status(404).send({
          erro: { codigo: 'TENANT_INEXISTENTE', mensagem: 'Condomínio não encontrado' },
        })
      }
      const valor = parsed.data.valor_centavos ?? PRECO_PLANO_CENTAVOS[tenant.plano] ?? PRECO_PLANO_CENTAVOS.start

      const [dup] = await fastify.db.unsafe(
        `SELECT id FROM faturas WHERE tenant_id = $1 AND competencia = $2`,
        [tenant_id, `${competencia}-01`]
      )
      if (dup) {
        return reply.status(409).send({
          erro: { codigo: 'FATURA_DUPLICADA', mensagem: 'Já existe fatura desta competência' },
        })
      }

      const vencimento = new Date(Date.now() + dias_vencimento * 86_400_000).toISOString().slice(0, 10)
      const cobranca = await emitirCobrancaCora(
        { tenant_nome: tenant.nome, valor_centavos: valor, vencimento, competencia },
        request.log
      )

      const rows = await fastify.db.unsafe(
        `INSERT INTO faturas
           (id, tenant_id, competencia, valor_centavos, vencimento, cora_invoice_id, linha_digitavel, pix_copia_cola)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [
          uuidv4(),
          tenant_id,
          `${competencia}-01`,
          valor,
          vencimento,
          cobranca.cora_invoice_id,
          cobranca.linha_digitavel,
          cobranca.pix_copia_cola,
        ]
      )
      return reply.status(201).send({ data: { ...rows[0], stub: cobranca.stub } })
    })

    admin.post('/admin/faturas/:id/baixa-manual', async (request, reply) => {
      const { id } = request.params as { id: string }
      BaixaManualBody.safeParse(request.body ?? {})
      const fatura = await marcarPaga(id, 'manual', (request.user as any).sub)
      if (!fatura) {
        return reply.status(409).send({
          erro: { codigo: 'FATURA_NAO_ABERTA', mensagem: 'Fatura inexistente ou já liquidada' },
        })
      }
      request.log.info({ fatura: id, por: (request.user as any).sub }, 'baixa manual de fatura')
      return reply.status(200).send({ data: fatura })
    })

    admin.post('/admin/faturas/:id/cancelar', async (request, reply) => {
      const { id } = request.params as { id: string }
      const rows = await fastify.db.unsafe(
        `UPDATE faturas SET status = 'cancelada' WHERE id = $1 AND status = 'aberta' RETURNING *`,
        [id]
      )
      if (rows.length === 0) {
        return reply.status(409).send({
          erro: { codigo: 'FATURA_NAO_ABERTA', mensagem: 'Fatura inexistente ou já liquidada' },
        })
      }
      return reply.status(200).send({ data: rows[0] })
    })
  })
}

export default faturasRoutes
