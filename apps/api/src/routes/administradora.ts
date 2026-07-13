import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { randomBytes, createHash } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import { createTenant } from '../services/tenantService.js'
import { hashPassword } from '../services/authService.js'
import { enviarEmail } from '../services/mailService.js'
import { registrarAuditoria } from '../services/auditoriaService.js'

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

const UpdateLicencaBody = z.object({
  renovar_dias: z.number().int().positive().optional(),
  ativa: z.boolean().optional(),
  desvincular_hardware: z.boolean().optional(),
}).refine(
  (b) => b.renovar_dias !== undefined || b.ativa !== undefined || b.desvincular_hardware,
  { message: 'Nada para atualizar' }
)

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

  fastify.get('/admin/condominios', async (request, reply) => {
    const { busca } = request.query as { busca?: string }
    const params: any[] = []
    let cond = 'true'
    if (busca) {
      params.push(`%${busca}%`)
      cond = `(t.nome ILIKE $1 OR l.license_key ILIKE $1)`
    }
    const tenants = await fastify.db.unsafe(
      `SELECT t.id, t.nome, t.codigo, t.schema_name, t.plano, t.ativo, t.criado_em,
              l.validade, l.max_unidades, l.license_key, l.edge_fingerprint, l.ativa AS licenca_ativa
       FROM tenants t LEFT JOIN licencas l ON l.tenant_id = t.id
       WHERE ${cond}
       ORDER BY t.nome`,
      params
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
        license_key: t.license_key,
        edge_fingerprint: t.edge_fingerprint,
        licenca_ativa: t.licenca_ativa,
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

  /**
   * Gestão de licença pelo time interno da Condar: renovar validade, ativar/
   * suspender, e desvincular o hardware do Edge (necessário quando o cliente
   * troca o equipamento — sem isso a licença fica presa ao fingerprint antigo
   * para sempre, ver validarLicencaPorKey em licencaService.ts).
   */
  fastify.patch('/admin/condominios/:id/licenca', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateLicencaBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const [tenant] = await fastify.db.unsafe(`SELECT id, schema_name FROM tenants WHERE id = $1`, [id])
    if (!tenant) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Condomínio não encontrado' },
      })
    }

    const depois = await fastify.withTenant(tenant.schema_name, async (sql) => {
      const [antes] = await sql.unsafe(`SELECT * FROM licencas WHERE tenant_id = $1`, [id])
      if (!antes) return null

      const sets: string[] = ['atualizado_em = NOW()']
      const params: any[] = []
      if (parsed.data.renovar_dias !== undefined) {
        params.push(parsed.data.renovar_dias)
        sets.push(`validade = GREATEST(COALESCE(validade, NOW()), NOW()) + ($${params.length} || ' days')::interval`)
      }
      if (parsed.data.ativa !== undefined) {
        params.push(parsed.data.ativa)
        sets.push(`ativa = $${params.length}`)
      }
      if (parsed.data.desvincular_hardware) {
        sets.push(`edge_fingerprint = NULL`)
      }
      params.push(id)
      const [row] = await sql.unsafe(
        `UPDATE licencas SET ${sets.join(', ')} WHERE tenant_id = $${params.length} RETURNING *`,
        params
      )

      await registrarAuditoria(sql, {
        usuario_id: null, // ação da administradora Condar, não de um usuário deste tenant
        acao: 'licenca.atualizar',
        tabela: 'licencas',
        registro_id: antes.id,
        dados_antes: antes,
        dados_depois: { ...row, atualizado_por_superadmin: (request.user as any).sub },
        ip: request.ip,
      })
      return row
    })

    if (!depois) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Condomínio sem licença cadastrada' },
      })
    }
    return reply.status(200).send({ data: depois })
  })

  /**
   * Gera o edge.config.json pronto do condomínio — o instalador só baixa e
   * solta na pasta do Edge (não precisa preencher tenant_id/schema_name/
   * license_key/credenciais à mão). Cria (ou reseta a senha de) um usuário
   * dedicado perfil "porteiro" para o Edge usar — a senha só aparece aqui,
   * neste momento do download.
   */
  fastify.get('/admin/condominios/:id/edge-config', async (request, reply) => {
    const { id } = request.params as { id: string }
    const [tenant] = await fastify.db.unsafe(
      `SELECT t.id, t.nome, t.schema_name, l.license_key
       FROM tenants t LEFT JOIN licencas l ON l.tenant_id = t.id
       WHERE t.id = $1`,
      [id]
    )
    if (!tenant) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Condomínio não encontrado' },
      })
    }

    // domínio fixo — schema_name tem underscore, que não é válido em domínio de e-mail
    const edgeEmail = `edge+${tenant.id}@condar.local`
    const senhaEdge = randomBytes(9).toString('base64url')
    const senhaHash = await hashPassword(senhaEdge)

    const dispositivos = await fastify.withTenant(tenant.schema_name, async (sql) => {
      const [existente] = await sql.unsafe(`SELECT id FROM usuarios_tenant WHERE email = $1`, [edgeEmail])
      if (existente) {
        await sql.unsafe(`UPDATE usuarios_tenant SET senha_hash = $1, ativo = true WHERE id = $2`, [
          senhaHash,
          existente.id,
        ])
      } else {
        await sql.unsafe(
          `INSERT INTO usuarios_tenant (id, email, senha_hash, perfil) VALUES ($1, $2, $3, 'porteiro')`,
          [uuidv4(), edgeEmail, senhaHash]
        )
      }
      await registrarAuditoria(sql, {
        usuario_id: null,
        acao: 'edge.config_gerado',
        tabela: 'usuarios_tenant',
        registro_id: null,
        dados_depois: { email: edgeEmail, gerado_por_superadmin: (request.user as any).sub },
        ip: request.ip,
      })
      return sql.unsafe(
        `SELECT id, tipo, nome FROM dispositivos WHERE ativo = true AND tipo IN ('lpr','leitor_facial','camera') ORDER BY nome`
      )
    })

    const config = {
      cloud_url: process.env.CLOUD_URL ?? 'https://api.condar.app',
      tenant_id: tenant.id,
      schema_name: tenant.schema_name,
      license_key: tenant.license_key ?? '<condomínio sem licença — gere uma antes de instalar>',
      email: edgeEmail,
      senha: senhaEdge,
      lpr_listen_port: 8090,
      heartbeat_seg: 60,
      sync_seg: 15,
      // Câmera de foto (tipo "camera"): a Cloud não fala com ela diretamente —
      // é o próprio Edge que puxa um snapshot via HTTP (usuario/senha aqui) no
      // instante do acesso, só para anexar a foto ao evento. Sem streaming/RTSP.
      dispositivos: (dispositivos as any[]).map((d) => ({
        dispositivo_id: d.id,
        tipo: d.tipo,
        nome: d.nome,
        ip: '<IP do equipamento na rede local>',
        usuario: 'admin',
        senha: '<senha do equipamento>',
        ...(d.tipo === 'camera'
          ? { snapshot_path: '<caminho HTTP do snapshot da câmera, ex.: /cgi-bin/snapshot.cgi?channel=1>' }
          : {}),
      })),
    }

    reply
      .header('content-type', 'application/json')
      .header(
        'content-disposition',
        `attachment; filename="edge.config.${tenant.nome.replace(/[^a-zA-Z0-9]+/g, '_')}.json"`
      )
    return reply.status(200).send(JSON.stringify(config, null, 2))
  })
}

export default administradoraRoutes
