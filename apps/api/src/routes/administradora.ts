import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { randomBytes, createHash } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { createTenant } from '../services/tenantService.js'
import { hashPassword } from '../services/authService.js'
import { enviarEmail } from '../services/mailService.js'

const CreateCondominioBody = z.object({
  nome: z.string().min(2),
  plano: z.enum(['start', 'pro', 'enterprise']).default('start'),
  sindico_email: z.string().email(),
  sindico_nome: z.string().min(2),
})

const UpdateCondominioBody = z.object({
  ativo: z.boolean().optional(),
  plano: z.enum(['start', 'pro', 'enterprise']).optional(),
}).refine((b) => b.ativo !== undefined || b.plano, { message: 'Nada para atualizar' })

/**
 * Painel da administradora (perfil superadmin): visão consolidada de todos os
 * condomínios (tenants), onboarding self-service de condomínio com convite ao
 * síndico, e gestão de plano/ativação. Rotas sob /admin/* ficam fora da
 * conexão reservada por tenant — operam no schema public + withTenant.
 */
const administradoraRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.addHook('preHandler', async (request, reply) => {
    if ((request.user as any).perfil !== 'superadmin') {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Painel exclusivo da administradora (superadmin)' },
      })
    }
  })

  fastify.get('/admin/resumo', async (_request, reply) => {
    const tenants = await fastify.db.unsafe(
      `SELECT t.id, t.schema_name, t.ativo, l.validade
       FROM tenants t LEFT JOIN licencas l ON l.tenant_id = t.id`
    )
    let unidades = 0
    let moradores = 0
    let ocorrenciasAbertas = 0
    for (const t of tenants as any[]) {
      if (!t.ativo) continue
      const [r] = await fastify.withTenant(t.schema_name, (sql) =>
        sql.unsafe(
          `SELECT (SELECT count(*)::int FROM unidades WHERE ativa = true) AS unidades,
                  (SELECT count(DISTINCT pessoa_id)::int FROM vinculos_unidade WHERE ativo = true) AS moradores,
                  (SELECT count(*)::int FROM ocorrencias WHERE status <> 'resolvida') AS ocorrencias`
        )
      )
      unidades += r.unidades
      moradores += r.moradores
      ocorrenciasAbertas += r.ocorrencias
    }
    const aVencer = (tenants as any[]).filter(
      (t) => t.validade && new Date(t.validade).getTime() < Date.now() + 30 * 86_400_000
    ).length
    return reply.status(200).send({
      data: {
        condominios: (tenants as any[]).filter((t) => t.ativo).length,
        unidades,
        moradores,
        ocorrencias_abertas: ocorrenciasAbertas,
        licencas_a_vencer_30d: aVencer,
      },
    })
  })

  fastify.get('/admin/condominios', async (_request, reply) => {
    const tenants = await fastify.db.unsafe(
      `SELECT t.id, t.nome, t.codigo, t.schema_name, t.plano, t.ativo, t.criado_em,
              l.validade, l.max_unidades
       FROM tenants t LEFT JOIN licencas l ON l.tenant_id = t.id
       ORDER BY t.nome`
    )
    const detalhes = []
    for (const t of tenants as any[]) {
      let uso: any = { unidades: 0, moradores: 0, ocorrencias_abertas: 0 }
      if (t.ativo) {
        const [r] = await fastify.withTenant(t.schema_name, (sql) =>
          sql.unsafe(
            `SELECT (SELECT count(*)::int FROM unidades WHERE ativa = true) AS unidades,
                    (SELECT count(DISTINCT pessoa_id)::int FROM vinculos_unidade WHERE ativo = true) AS moradores,
                    (SELECT count(*)::int FROM ocorrencias WHERE status <> 'resolvida') AS ocorrencias_abertas`
          )
        )
        uso = r
      }
      detalhes.push({
        id: t.id,
        nome: t.nome,
        plano: t.plano,
        ativo: t.ativo,
        validade: t.validade,
        max_unidades: t.max_unidades,
        ...uso,
      })
    }
    return reply.status(200).send({ data: detalhes })
  })

  fastify.post('/admin/condominios', async (request, reply) => {
    const parsed = CreateCondominioBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { nome, plano, sindico_email, sindico_nome } = parsed.data

    const [dup] = await fastify.db.unsafe(`SELECT id FROM tenants WHERE nome = $1`, [nome])
    if (dup) {
      return reply.status(409).send({
        erro: { codigo: 'CONDOMINIO_DUPLICADO', mensagem: 'Já existe um condomínio com esse nome' },
      })
    }

    // cria tenant + schema + licença (reuso do serviço)
    const tenant: any = await createTenant(fastify.db, nome, plano)
    const schema = tenant.schema_name ?? tenant.schemaName

    // estrutura mínima + síndico convidado (define a senha via convite)
    const conviteToken = randomBytes(32).toString('hex')
    await fastify.withTenant(schema, async (sql) => {
      const condId = uuidv4()
      const blocoId = uuidv4()
      const pessoaId = uuidv4()
      const usuarioId = uuidv4()
      await sql.unsafe(`INSERT INTO condominios (id, nome) VALUES ($1, $2)`, [condId, nome])
      await sql.unsafe(
        `INSERT INTO blocos (id, condominio_id, nome) VALUES ($1, $2, 'Bloco Único')`,
        [blocoId, condId]
      )
      await sql.unsafe(`INSERT INTO pessoas (id, nome, tipo) VALUES ($1, $2, 'morador')`, [
        pessoaId,
        sindico_nome,
      ])
      // senha aleatória inutilizável até o convite ser aceito
      const senhaHash = await hashPassword(randomBytes(16).toString('hex'))
      await sql.unsafe(
        `INSERT INTO usuarios_tenant (id, pessoa_id, email, senha_hash, perfil)
         VALUES ($1, $2, $3, $4, 'sindico')`,
        [usuarioId, pessoaId, sindico_email, senhaHash]
      )
      await sql.unsafe(
        `INSERT INTO tokens_conta (id, usuario_id, tipo, token_hash, expira_em)
         VALUES ($1, $2, 'convite', $3, NOW() + INTERVAL '7 days')`,
        [uuidv4(), usuarioId, createHash('sha256').update(conviteToken).digest('hex')]
      )
    })

    await enviarEmail(
      {
        para: sindico_email,
        assunto: `condar — seu condomínio "${nome}" está pronto`,
        texto: `Bem-vindo ao condar! Use o código abaixo para ativar sua conta de síndico (7 dias):\n\n${conviteToken}\n\ntenant_id: ${tenant.id}`,
      },
      request.log
    )

    return reply.status(201).send({
      data: {
        tenant_id: tenant.id,
        nome,
        plano,
        convite_sindico: conviteToken,
        sindico_email,
      },
    })
  })

  fastify.patch('/admin/condominios/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateCondominioBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const [tenant] = await fastify.db.unsafe(`SELECT * FROM tenants WHERE id = $1`, [id])
    if (!tenant) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Condomínio não encontrado' },
      })
    }
    if (parsed.data.ativo !== undefined) {
      await fastify.db.unsafe(`UPDATE tenants SET ativo = $1 WHERE id = $2`, [parsed.data.ativo, id])
    }
    if (parsed.data.plano) {
      const LIM: Record<string, number | null> = { start: 50, pro: 500, enterprise: null }
      await fastify.db.unsafe(`UPDATE tenants SET plano = $1 WHERE id = $2`, [parsed.data.plano, id])
      await fastify.db.unsafe(
        `UPDATE licencas SET plano = $1, max_unidades = $2 WHERE tenant_id = $3`,
        [parsed.data.plano, LIM[parsed.data.plano] ?? 1000000, id]
      )
    }
    const [depois] = await fastify.db.unsafe(`SELECT * FROM tenants WHERE id = $1`, [id])
    return reply.status(200).send({ data: depois })
  })
}

export default administradoraRoutes
