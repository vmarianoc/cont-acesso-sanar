import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { registrarAuditoria } from '../services/auditoriaService.js'
import { enfileirarComandoFacial } from '../services/syncEdgeService.js'
import { hashPassword } from '../services/authService.js'
import { enviarEmail } from '../services/mailService.js'
import { createHash, randomBytes } from 'node:crypto'
import { enqueueNotificacao } from '../workers/notificacoesQueue.js'
import { criarLiberacao } from '../services/acessoService.js'

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

// Vocabulário entendido pelo Edge (apps/edge → API BioT Intelbras).
// Veículos não geram comando de hardware: o LPR consulta a Cloud/cache.
function comandoDoTipo(tipoAprovacao: string): 'pessoa.atualizar' | 'pessoa.remover' | 'face.atualizar' | null {
  const t = tipoAprovacao.toLowerCase()
  if (t.includes('veiculo')) return null
  if (t.includes('biometria') || t.includes('facial') || t.includes('foto')) return 'face.atualizar'
  if (t.includes('bloqueio')) return 'pessoa.remover'
  if (t.includes('pessoa') || t.includes('morador') || t.includes('titular') || t.includes('funcionario'))
    return 'pessoa.atualizar'
  return null
}

const aprovacoesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/aprovacoes', async (request, reply) => {
    const query = request.query as { status?: string; page?: string; limit?: string }
    const page = Math.max(1, parseInt(query.page ?? '1', 10))
    const limit = Math.min(100, parseInt(query.limit ?? '20', 10))
    const offset = (page - 1) * limit

    const where = query.status ? `WHERE a.status = $1` : ''
    const params = query.status ? [query.status] : []
    const rows = await request.tenantDb!.unsafe(
      `SELECT a.*, p.nome AS pessoa_nome, u.numero AS unidade_numero
       FROM aprovacoes a
       LEFT JOIN pessoas p ON p.id = a.pessoa_id
       LEFT JOIN unidades u ON u.id = a.unidade_id
       ${where}
       ORDER BY a.criado_em DESC LIMIT ${limit} OFFSET ${offset}`,
      params
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
        // Solicitação de cadastro (implantação): cria a pessoa e o usuário e
        // envia o convite para o morador definir a senha.
        if (atualizada.tipo === 'novo_morador') {
          const d = (typeof atualizada.dados === 'string' ? JSON.parse(atualizada.dados) : atualizada.dados) ?? {}
          const pessoaId = uuidv4()
          await db.unsafe(
            `INSERT INTO pessoas (id, nome, cpf, email, telefone, tipo) VALUES ($1, $2, $3, $4, $5, 'morador')`,
            [pessoaId, d.nome, d.cpf ?? null, d.email, d.telefone ?? null]
          )
          const usuarioId = uuidv4()
          await db.unsafe(
            `INSERT INTO usuarios_tenant (id, pessoa_id, email, senha_hash, perfil)
             VALUES ($1, $2, $3, $4, 'morador')`,
            [usuarioId, pessoaId, d.email, await hashPassword(randomBytes(16).toString('hex'))]
          )
          const tokenConvite = randomBytes(24).toString('hex')
          await db.unsafe(
            `INSERT INTO tokens_conta (id, usuario_id, tipo, token_hash, expira_em)
             VALUES ($1, $2, 'convite', $3, NOW() + INTERVAL '7 days')`,
            [uuidv4(), usuarioId, createHash('sha256').update(tokenConvite).digest('hex')]
          )
          await enviarEmail(
            {
              para: d.email,
              assunto: 'Cadastro aprovado — defina sua senha no condar',
              texto:
                `Olá, ${d.nome}!

Seu cadastro foi aprovado pelo condomínio.
` +
                `Defina sua senha em: https://morador.condar.app/convite?token=${tokenConvite}

` +
                `O link vale por 7 dias.`,
            },
            request.log
          )
          atualizada.pessoa_id = pessoaId
          await enfileirarComandoFacial(db, 'pessoa.criar', pessoaId, { aprovacao_id: id })
        } else {
          const tipoComando = comandoDoTipo(atualizada.tipo)
          if (tipoComando && atualizada.pessoa_id) {
            await enfileirarComandoFacial(db, tipoComando, atualizada.pessoa_id, {
              aprovacao_id: id,
              unidade_id: atualizada.unidade_id,
            })
          }
        }
      }

      // Reserva com aprovação: confirma (ou cancela) a reserva vinculada e,
      // no aprovado, cria a liberação facial restrita ao período.
      if (atualizada.tipo === 'reserva_espaco' && atualizada.dados?.reserva_id) {
        const reservaId = atualizada.dados.reserva_id as string
        if (status === 'aprovado') {
          const [reserva] = await db.unsafe(
            `UPDATE reservas SET status = 'confirmada' WHERE id = $1 RETURNING *`,
            [reservaId]
          )
          if (reserva) {
            const [espaco] = await db.unsafe(
              `SELECT area, periodos FROM espacos WHERE id = $1`,
              [reserva.espaco_id]
            )
            const faixa = (espaco?.periodos ?? []).find((p: any) => p.nome === reserva.periodo)
            if (espaco?.area && faixa) {
              const dia = new Date(reserva.data).toISOString().slice(0, 10)
              await criarLiberacao(db, {
                pessoa_id: reserva.pessoa_id,
                area: espaco.area,
                valido_de: `${dia}T${faixa.inicio}:00`,
                valido_ate: `${dia}T${faixa.fim}:00`,
                origem_tipo: 'reserva',
                origem_id: reservaId,
              })
            }
          }
        } else {
          await db.unsafe(`UPDATE reservas SET status = 'cancelada' WHERE id = $1`, [reservaId])
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
