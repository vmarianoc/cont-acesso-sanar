import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { hashPassword } from '../services/authService.js'
import { enviarEmail } from '../services/mailService.js'
import { registrarAuditoria } from '../services/auditoriaService.js'

const soDigitos = (v: string) => v.replace(/[^0-9]/g, '')

/**
 * Auto-cadastro de morador na implantação:
 * 1. Síndico importa a lista (pessoas com e-mail/CPF) e DISPARA os códigos
 *    quando quiser — nenhum e-mail sai sem esse clique.
 * 2. Morador da lista confirma com e-mail/CPF + código e cria a senha.
 * 3. Quem não está na lista solicita cadastro; o síndico aprova na central
 *    de aprovações e o sistema envia o convite.
 */
const registroRoutes: FastifyPluginAsync = async (fastify) => {
  // ---- Disparo pelo síndico (autenticado) ----
  fastify.post(
    '/registro/disparar',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const perfil = (request.user as any).perfil as string
      if (!['sindico', 'admin', 'superadmin'].includes(perfil)) {
        return reply.status(403).send({
          erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas síndico/admin disparam os códigos' },
        })
      }
      const parsed = z.object({ pessoa_id: z.string().uuid().optional() }).safeParse(request.body ?? {})
      const filtro = parsed.success && parsed.data.pessoa_id ? `AND p.id = '${parsed.data.pessoa_id}'` : ''
      const pessoas = await request.tenantDb!.unsafe(
        `SELECT p.id, p.nome, p.email FROM pessoas p
         WHERE p.ativo = true AND p.email IS NOT NULL AND p.email <> ''
           AND NOT EXISTS (SELECT 1 FROM usuarios_tenant u WHERE u.pessoa_id = p.id)
           ${filtro}`
      )
      const [tenant] = await fastify.db.unsafe(
        `SELECT nome FROM public.tenants WHERE id = $1`,
        [(request.user as any).tenant_id]
      )
      let enviados = 0
      for (const p of pessoas as any[]) {
        const codigo = String(Math.floor(100000 + Math.random() * 900000))
        await request.tenantDb!.unsafe(
          `INSERT INTO registro_codigos (id, pessoa_id, codigo, expira_em)
           VALUES ($1, $2, $3, NOW() + INTERVAL '7 days')`,
          [uuidv4(), p.id, codigo]
        )
        await enviarEmail(
          {
            para: p.email,
            assunto: `Seu código de cadastro — ${tenant?.nome ?? 'condar'}`,
            texto:
              `Olá, ${p.nome}!\n\n` +
              `O condomínio ${tenant?.nome ?? ''} liberou seu acesso ao aplicativo condar.\n` +
              `Acesse https://morador.condar.app, toque em "Primeiro acesso" e informe:\n\n` +
              `Código de cadastro: ${codigo}\n\n` +
              `O código vale por 7 dias. Se você não esperava este e-mail, ignore-o.`,
          },
          request.log
        )
        enviados++
      }
      await registrarAuditoria(request.tenantDb!, {
        usuario_id: (request.user as any).sub,
        acao: 'registro.disparar_codigos',
        tabela: 'registro_codigos',
        registro_id: (request.user as any).tenant_id,
        dados_depois: { enviados },
        ip: request.ip,
      })
      return reply.status(200).send({ data: { enviados } })
    }
  )

  /** Quantos moradores da lista ainda não criaram conta (para o botão). */
  fastify.get(
    '/registro/pendentes',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      const [r] = await request.tenantDb!.unsafe(
        `SELECT COUNT(*)::int AS total FROM pessoas p
         WHERE p.ativo = true AND p.email IS NOT NULL AND p.email <> ''
           AND NOT EXISTS (SELECT 1 FROM usuarios_tenant u WHERE u.pessoa_id = p.id)`
      )
      return reply.status(200).send({ data: { pendentes: r.total } })
    }
  )

  // ---- Público: lista de condomínios para a solicitação ----
  fastify.get('/auth/condominios', async (_request, reply) => {
    const rows = await fastify.db.unsafe(
      `SELECT id AS tenant_id, nome FROM public.tenants WHERE ativo = true ORDER BY nome`
    )
    return reply.status(200).send({ data: rows })
  })

  // ---- Público: confirmar cadastro com o código recebido ----
  fastify.post('/auth/registro/confirmar', async (request, reply) => {
    const Body = z.object({
      identificador: z.string().min(3),
      codigo: z.string().length(6),
      senha: z.string().min(8),
      tenant_id: z.string().uuid().optional(),
    })
    const parsed = Body.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { identificador, codigo, senha, tenant_id } = parsed.data
    const porEmail = identificador.includes('@')

    const tenants = tenant_id
      ? await fastify.db.unsafe(`SELECT id, schema_name FROM public.tenants WHERE id = $1 AND ativo = true`, [tenant_id])
      : await fastify.db.unsafe(`SELECT id, schema_name FROM public.tenants WHERE ativo = true ORDER BY nome`)

    for (const t of tenants as any[]) {
      const resultado = await fastify.withTenant(t.schema_name, async (sql) => {
        const [pessoa] = porEmail
          ? await sql.unsafe(
              `SELECT id, nome, email FROM pessoas WHERE LOWER(email) = LOWER($1) AND ativo = true LIMIT 1`,
              [identificador.trim()]
            )
          : await sql.unsafe(
              `SELECT id, nome, email FROM pessoas
               WHERE REGEXP_REPLACE(COALESCE(cpf,''), '[^0-9]', '', 'g') = $1 AND COALESCE(cpf,'') <> '' AND ativo = true
               LIMIT 1`,
              [soDigitos(identificador)]
            )
        if (!pessoa) return null
        const [jaTem] = await sql.unsafe(`SELECT id FROM usuarios_tenant WHERE pessoa_id = $1`, [pessoa.id])
        if (jaTem) return { erro: 'JA_CADASTRADO' as const }
        const [cod] = await sql.unsafe(
          `SELECT id FROM registro_codigos
           WHERE pessoa_id = $1 AND codigo = $2 AND usado_em IS NULL AND expira_em > NOW()
           ORDER BY criado_em DESC LIMIT 1`,
          [pessoa.id, codigo]
        )
        if (!cod) return { erro: 'CODIGO_INVALIDO' as const }
        if (!pessoa.email) return { erro: 'SEM_EMAIL' as const }

        const usuarioId = uuidv4()
        await sql.unsafe(
          `INSERT INTO usuarios_tenant (id, pessoa_id, email, senha_hash, perfil)
           VALUES ($1, $2, $3, $4, 'morador')`,
          [usuarioId, pessoa.id, pessoa.email, await hashPassword(senha)]
        )
        await sql.unsafe(`UPDATE registro_codigos SET usado_em = NOW() WHERE id = $1`, [cod.id])
        await registrarAuditoria(sql, {
          usuario_id: usuarioId,
          acao: 'registro.confirmado',
          tabela: 'usuarios_tenant',
          registro_id: usuarioId,
          dados_depois: { pessoa_id: pessoa.id },
        })
        return { usuarioId, perfil: 'morador' }
      })

      if (resultado && 'erro' in resultado && resultado.erro) {
        const mensagens: Record<string, string> = {
          JA_CADASTRADO: 'Você já tem conta — use "Esqueci minha senha" se precisar',
          CODIGO_INVALIDO: 'Código inválido ou expirado — peça um novo ao síndico',
          SEM_EMAIL: 'Cadastro sem e-mail — fale com a administração',
        }
        return reply.status(400).send({
          erro: { codigo: resultado.erro, mensagem: mensagens[resultado.erro] },
        })
      }
      if (resultado) {
        const schemaName = `tenant_${(t.id as string).replace(/-/g, '_')}`
        const token = fastify.jwt.sign({
          sub: resultado.usuarioId,
          tenant_id: t.id,
          perfil: resultado.perfil,
          schema_name: schemaName,
        })
        const [tn] = await fastify.db.unsafe(`SELECT nome FROM public.tenants WHERE id = $1`, [t.id])
        return reply.status(201).send({
          data: { token, perfil: resultado.perfil, tenant_id: t.id, condominio: tn?.nome ?? null },
        })
      }
    }
    return reply.status(404).send({
      erro: {
        codigo: 'NAO_ENCONTRADO',
        mensagem: 'E-mail/CPF não encontrado na lista do condomínio — solicite seu cadastro',
      },
    })
  })

  // ---- Público: solicitar cadastro (fora da lista) ----
  fastify.post('/auth/registro/solicitar', async (request, reply) => {
    const Body = z.object({
      tenant_id: z.string().uuid(),
      nome: z.string().min(3),
      email: z.string().email(),
      cpf: z.string().optional(),
      telefone: z.string().optional(),
      unidade: z.string().optional(),
    })
    const parsed = Body.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { tenant_id, ...dados } = parsed.data
    const [tenant] = await fastify.db.unsafe(
      `SELECT schema_name, nome FROM public.tenants WHERE id = $1 AND ativo = true`,
      [tenant_id]
    )
    if (!tenant) {
      return reply.status(404).send({
        erro: { codigo: 'CONDOMINIO_INVALIDO', mensagem: 'Condomínio não encontrado' },
      })
    }
    const aprovacaoId = uuidv4()
    await fastify.withTenant(tenant.schema_name, async (sql) => {
      await sql.unsafe(
        `INSERT INTO aprovacoes (id, tipo, dados) VALUES ($1, 'novo_morador', $2)`,
        [aprovacaoId, (sql as any).json(dados)]
      )
    })
    await fastify.publishRt(tenant.schema_name, ['perfil:sindico', 'perfil:admin'], {
      tipo: 'nova_aprovacao',
      dados: { tipo: 'novo_morador', nome: dados.nome },
    })
    return reply.status(201).send({
      data: {
        solicitado: true,
        mensagem: `Solicitação enviada ao ${tenant.nome}. Você receberá um e-mail quando for aprovada.`,
      },
    })
  })
}

export default registroRoutes
