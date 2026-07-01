import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { registrarAuditoria } from '../services/auditoriaService.js'
import { enqueueNotificacao } from '../workers/notificacoesQueue.js'

const CreateAprovacaoBody = z.object({
  pessoa_id: z.string().uuid(),
  unidade_id: z.string().uuid(),
  tipo: z.string().min(1),
  dados: z.record(z.unknown()).default({}),
})

const UpdateAprovacaoBody = z.object({
  status: z.enum(['aprovado', 'rejeitado']),
  observacao: z.string().optional(),
})

function comandoDoTipo(tipoAprovacao: string): string {
  const t = tipoAprovacao.toLowerCase()
  if (t.includes('veiculo')) return 'cadastro.veiculo'
  if (t.includes('biometria')) return 'biometria.sincronizar'
  if (t.includes('bloqueio')) return 'pessoa.bloquear'
  if (t.includes('pessoa') || t.includes('morador') || t.includes('titular') || t.includes('funcionario'))
    return 'cadastro.pessoa'
  return 'config.atualizar'
}

const aprovacoesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/aprovacoes', async (request, reply) => {
    const query = request.query as { status?: string; page?: string; limit?: string }
    const page = Math.max(1, parseInt(query.page ?? '1', 10))
    const limit = Math.min(100, parseInt(query.limit ?? '20', 10))
    const offset = (page - 1) * limit

    const rows = query.status
      ? await request.tenantDb!.unsafe(
          `SELECT * FROM aprovacoes WHERE status = $1 ORDER BY criado_em DESC LIMIT ${limit} OFFSET ${offset}`,
          [query.status]
        )
      : await request.tenantDb!.unsafe(
          `SELECT * FROM aprovacoes ORDER BY criado_em DESC LIMIT ${limit} OFFSET ${offset}`
        )

    return reply.status(200).send({ data: rows })
  })

  fastify.post('/aprovacoes', async (request, reply) => {
    const parsed = CreateAprovacaoBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const { pessoa_id, unidade_id, tipo, dados } = parsed.data
    const id = uuidv4()
    const db = request.tenantDb!

    const rows = await db.unsafe(
      `INSERT INTO aprovacoes (id, pessoa_id, unidade_id, tipo, dados)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [id, pessoa_id, unidade_id, tipo, db.json(dados as any)] as any
    )

    await registrarAuditoria(db, {
      usuario_id: (request.user as any).sub,
      acao: 'INSERT',
      tabela: 'aprovacoes',
      registro_id: id,
      dados_depois: rows[0] as Record<string, unknown>,
      ip: request.ip,
    })

    return reply.status(201).send({ data: rows[0] })
  })

  fastify.patch('/aprovacoes/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateAprovacaoBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const { status, observacao } = parsed.data
    const aprovador_id = (request.user as any).sub
    const db = request.tenantDb!

    const existentes = await db.unsafe(`SELECT * FROM aprovacoes WHERE id = $1`, [id])
    if (existentes.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Aprovação não encontrada' },
      })
    }
    const antes = existentes[0] as Record<string, unknown>

    let atualizada: Record<string, any>
    await db.unsafe('BEGIN')
    try {
      const rows = await db.unsafe(
        `UPDATE aprovacoes SET status = $1, atualizado_em = NOW() WHERE id = $2 RETURNING *`,
        [status, id]
      )
      atualizada = rows[0] as Record<string, any>

      await db.unsafe(
        `INSERT INTO historico_aprovacoes (id, aprovacao_id, status, aprovador_id, observacao)
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), id, status, aprovador_id, observacao ?? null]
      )

      if (status === 'aprovado') {
        const dispositivos = await db.unsafe<{ id: string }[]>(
          `SELECT id FROM dispositivos WHERE ativo = true`
        )
        const tipoComando = comandoDoTipo(atualizada.tipo)
        const payload = {
          aprovacao_id: id,
          pessoa_id: atualizada.pessoa_id,
          unidade_id: atualizada.unidade_id,
          dados: atualizada.dados,
        }
        for (const disp of dispositivos) {
          await db.unsafe(
            `INSERT INTO sync_queue (id, dispositivo_id, tipo_comando, payload)
             VALUES ($1, $2, $3, $4)`,
            [uuidv4(), disp.id, tipoComando, db.json(payload)] as any
          )
        }
      }

      const titulo = status === 'aprovado' ? 'Solicitação aprovada' : 'Solicitação reprovada'
      const mensagem =
        status === 'aprovado'
          ? `Sua solicitação (${atualizada.tipo}) foi aprovada.`
          : `Sua solicitação (${atualizada.tipo}) foi reprovada.${observacao ? ' Motivo: ' + observacao : ''}`

      await db.unsafe(
        `INSERT INTO notificacoes (id, pessoa_id, titulo, mensagem, tipo, dados)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          uuidv4(),
          atualizada.pessoa_id,
          titulo,
          mensagem,
          'aprovacao',
          db.json({ aprovacao_id: id, status }),
        ] as any
      )

      await registrarAuditoria(db, {
        usuario_id: aprovador_id,
        acao: 'UPDATE',
        tabela: 'aprovacoes',
        registro_id: id,
        dados_antes: antes,
        dados_depois: atualizada,
        ip: request.ip,
      })

      await db.unsafe('COMMIT')
    } catch (err) {
      await db.unsafe('ROLLBACK')
      throw err
    }

    const schemaName = (request.user as any).schema_name as string
    try {
      await enqueueNotificacao({
        schema_name: schemaName,
        pessoa_id: atualizada.pessoa_id,
        titulo: status === 'aprovado' ? 'Solicitação aprovada' : 'Solicitação reprovada',
        mensagem: `Sua solicitação (${atualizada.tipo}) foi ${status}.`,
        tipo: 'aprovacao',
        dados: { aprovacao_id: id, status },
      })
    } catch (err) {
      request.log.warn({ err }, 'falha ao enfileirar notificação de aprovação')
    }

    return reply.status(200).send({ data: atualizada })
  })
}

export default aprovacoesRoutes
