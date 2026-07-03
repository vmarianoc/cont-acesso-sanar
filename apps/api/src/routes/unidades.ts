import type { FastifyPluginAsync } from 'fastify'
import { z } from 'zod'
import { v4 as uuidv4 } from 'uuid'
import { registrarAuditoria } from '../services/auditoriaService.js'
import {
  parsePdf,
  mapRelatorioParaPlano,
  aplicarImportacao,
  type RelatorioParseado,
} from '../services/pdfImportService.js'
import { parseCsv, parseExcel } from '../services/sheetImportService.js'
import { listarRamaisPorUnidade } from '../services/ramalSipService.js'
import {
  getLicencaEfetiva,
  contarUnidades,
  contarDispositivos,
  contarNovasNoImport,
  assegurarCapacidade,
  LicencaError,
} from '../services/licencaService.js'

const CreateUnidadeBody = z.object({
  bloco_id: z.string().uuid(),
  numero: z.string().min(1),
  andar: z.number().int().optional(),
})

const UpdateUnidadeBody = z.object({
  numero: z.string().min(1).optional(),
  andar: z.number().int().optional(),
  ativa: z.boolean().optional(),
})

const CreateVinculoBody = z.object({
  pessoa_id: z.string().uuid(),
  tipo_vinculo: z.enum(['proprietario', 'inquilino', 'dependente', 'funcionario']),
  principal: z.boolean().default(false),
})

const PERFIS_IMPORT = new Set(['admin', 'sindico', 'superadmin'])

const unidadesRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/licenca', async (request, reply) => {
    const user = request.user as { tenant_id: string }
    const licenca = await getLicencaEfetiva(fastify.db, user.tenant_id)
    const unidades = await contarUnidades(request.tenantDb!)
    const dispositivos = await contarDispositivos(request.tenantDb!)
    return reply.status(200).send({
      data: {
        plano: licenca.plano,
        ativa: licenca.ativa,
        validade: licenca.validade,
        expirada: licenca.expirada,
        limites: { unidades: licenca.maxUnidades, dispositivos: licenca.maxDispositivos },
        uso: { unidades, dispositivos },
      },
    })
  })

  // Importação de unidades/moradores a partir de um arquivo do condomínio
  // (PDF do relatório "Contatos das unidades", CSV ou Excel).
  // ?dry_run=true (padrão) apenas pré-visualiza; ?dry_run=false grava.
  fastify.post('/unidades/importar', async (request, reply) => {
    const user = request.user as { perfil: string; sub: string }
    if (!PERFIS_IMPORT.has(user.perfil)) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas síndico ou administrador podem importar' },
      })
    }

    const file = await (request as any).file()
    if (!file) {
      return reply.status(400).send({
        erro: { codigo: 'ARQUIVO_FALTANDO', mensagem: 'Envie o arquivo no campo "file"' },
      })
    }
    const buffer = await file.toBuffer()

    const extensao = (file.filename ?? '').split('.').pop()?.toLowerCase()
    const parsers: Record<string, (buf: Buffer) => Promise<RelatorioParseado> | RelatorioParseado> = {
      pdf: parsePdf,
      csv: parseCsv,
      xlsx: parseExcel,
      xls: parseExcel,
    }
    const parser = extensao ? parsers[extensao] : undefined
    if (!parser) {
      return reply.status(400).send({
        erro: {
          codigo: 'FORMATO_NAO_SUPORTADO',
          mensagem: 'Envie um arquivo .pdf, .csv, .xlsx ou .xls',
        },
      })
    }

    const query = request.query as { dry_run?: string; condominio?: string; bloco?: string }
    const dryRun = query.dry_run !== 'false'

    let relatorio: RelatorioParseado
    try {
      relatorio = await parser(buffer)
    } catch (err) {
      request.log.error({ err }, 'falha ao parsear arquivo de importação')
      return reply.status(422).send({
        erro: { codigo: 'ARQUIVO_INVALIDO', mensagem: 'Não foi possível ler o arquivo enviado' },
      })
    }

    const plano = mapRelatorioParaPlano(relatorio, {
      condominioNome: query.condominio,
      bloco: query.bloco,
    })

    const tenantId = (request.user as any).tenant_id as string
    const licenca = await getLicencaEfetiva(fastify.db, tenantId)
    const atual = await contarUnidades(request.tenantDb!)
    const novas = await contarNovasNoImport(
      request.tenantDb!,
      plano.condominioNome,
      plano.bloco,
      plano.unidades.map((u) => u.numero)
    )
    const cabe =
      licenca.maxUnidades === null || atual + novas <= licenca.maxUnidades

    if (dryRun) {
      return reply.status(200).send({
        data: {
          dry_run: true,
          condominio: plano.condominioNome,
          bloco: plano.bloco,
          totais: plano.totais,
          licenca: {
            plano: licenca.plano,
            limite_unidades: licenca.maxUnidades,
            unidades_atuais: atual,
            novas_unidades: novas,
            cabe,
          },
          amostra: plano.unidades.slice(0, 10),
        },
      })
    }

    try {
      assegurarCapacidade(licenca, atual, novas)
    } catch (err) {
      if (err instanceof LicencaError) {
        return reply.status(err.status).send({ erro: { codigo: err.codigo, mensagem: err.message } })
      }
      throw err
    }

    const resultado = await aplicarImportacao(request.tenantDb!, plano, {
      usuarioId: user.sub,
      ip: request.ip,
    })

    return reply.status(201).send({
      data: { dry_run: false, condominio: plano.condominioNome, totais: plano.totais, resultado },
    })
  })

  fastify.get('/unidades', async (request, reply) => {
    const query = request.query as {
      bloco_id?: string
      condominio_id?: string
      ativa?: string
      busca?: string
      page?: string
      limit?: string
    }
    const page = Math.max(1, parseInt(query.page ?? '1', 10))
    const limit = Math.min(200, parseInt(query.limit ?? '50', 10))
    const offset = (page - 1) * limit

    const conditions: string[] = []
    const params: any[] = []
    if (query.bloco_id) conditions.push(`u.bloco_id = $${params.push(query.bloco_id)}`)
    if (query.condominio_id) conditions.push(`b.condominio_id = $${params.push(query.condominio_id)}`)
    if (query.ativa !== undefined) conditions.push(`u.ativa = $${params.push(query.ativa === 'true')}`)
    if (query.busca) conditions.push(`u.numero ILIKE $${params.push('%' + query.busca + '%')}`)
    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    const rows = await request.tenantDb!.unsafe(
      `SELECT u.*,
              json_build_object('id', b.id, 'nome', b.nome) AS bloco,
              json_build_object('id', c.id, 'nome', c.nome) AS condominio
       FROM unidades u
       JOIN blocos b ON b.id = u.bloco_id
       JOIN condominios c ON c.id = b.condominio_id
       ${where}
       ORDER BY c.nome, b.nome, u.numero
       LIMIT ${limit} OFFSET ${offset}`,
      params
    )
    return reply.status(200).send({ data: rows })
  })

  fastify.get('/unidades/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await request.tenantDb!.unsafe(
      `SELECT u.*,
              json_build_object('id', b.id, 'nome', b.nome) AS bloco,
              json_build_object('id', c.id, 'nome', c.nome) AS condominio
       FROM unidades u
       JOIN blocos b ON b.id = u.bloco_id
       JOIN condominios c ON c.id = b.condominio_id
       WHERE u.id = $1`,
      [id]
    )
    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Unidade não encontrada' },
      })
    }
    return reply.status(200).send({ data: rows[0] })
  })

  fastify.post('/unidades', async (request, reply) => {
    const parsed = CreateUnidadeBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { bloco_id, numero, andar } = parsed.data
    const db = request.tenantDb!

    const bloco = await db.unsafe(`SELECT id FROM blocos WHERE id = $1`, [bloco_id])
    if (bloco.length === 0) {
      return reply.status(400).send({
        erro: { codigo: 'BLOCO_INVALIDO', mensagem: 'Bloco não encontrado' },
      })
    }

    const dup = await db.unsafe(
      `SELECT id FROM unidades WHERE bloco_id = $1 AND numero = $2`,
      [bloco_id, numero]
    )
    if (dup.length > 0) {
      return reply.status(409).send({
        erro: { codigo: 'UNIDADE_DUPLICADA', mensagem: 'Já existe uma unidade com esse número no bloco' },
      })
    }

    const licenca = await getLicencaEfetiva(fastify.db, (request.user as any).tenant_id)
    try {
      assegurarCapacidade(licenca, await contarUnidades(db), 1)
    } catch (err) {
      if (err instanceof LicencaError) {
        return reply.status(err.status).send({ erro: { codigo: err.codigo, mensagem: err.message } })
      }
      throw err
    }

    const id = uuidv4()
    const rows = await db.unsafe(
      `INSERT INTO unidades (id, bloco_id, numero, andar) VALUES ($1, $2, $3, $4) RETURNING *`,
      [id, bloco_id, numero, andar ?? null]
    )

    await registrarAuditoria(db, {
      usuario_id: (request.user as any).sub,
      acao: 'INSERT',
      tabela: 'unidades',
      registro_id: id,
      dados_depois: rows[0] as Record<string, unknown>,
      ip: request.ip,
    })

    return reply.status(201).send({ data: rows[0] })
  })

  fastify.patch('/unidades/:id', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = UpdateUnidadeBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }

    const updates: string[] = []
    const params: any[] = []
    for (const [campo, valor] of Object.entries(parsed.data)) {
      if (valor !== undefined) updates.push(`${campo} = $${params.push(valor)}`)
    }
    if (updates.length === 0) {
      return reply.status(400).send({
        erro: { codigo: 'SEM_ALTERACOES', mensagem: 'Nenhum campo para atualizar' },
      })
    }

    const rows = await request.tenantDb!.unsafe(
      `UPDATE unidades SET ${updates.join(', ')} WHERE id = $${params.push(id)} RETURNING *`,
      params
    )
    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Unidade não encontrada' },
      })
    }

    await registrarAuditoria(request.tenantDb!, {
      usuario_id: (request.user as any).sub,
      acao: 'UPDATE',
      tabela: 'unidades',
      registro_id: id,
      dados_depois: rows[0] as Record<string, unknown>,
      ip: request.ip,
    })

    return reply.status(200).send({ data: rows[0] })
  })

  // Ocupantes (vínculos) da unidade
  fastify.get('/unidades/:id/ocupantes', async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await request.tenantDb!.unsafe(
      `SELECT v.id, v.pessoa_id, v.tipo_vinculo, v.principal, v.inicio, v.fim,
              p.nome AS pessoa_nome
       FROM vinculos_unidade v
       JOIN pessoas p ON p.id = v.pessoa_id
       WHERE v.unidade_id = $1 AND v.ativo = true
       ORDER BY v.principal DESC, p.nome`,
      [id]
    )
    return reply.status(200).send({ data: rows })
  })

  // Ramais SIP dos ocupantes da unidade (para a portaria discar) — sem
  // credenciais, só número + nome (Central SIP, docs/modules/central-sip.md).
  fastify.get('/unidades/:id/ramais', async (request, reply) => {
    const { id } = request.params as { id: string }
    const rows = await listarRamaisPorUnidade(request.tenantDb!, id)
    return reply.status(200).send({ data: rows })
  })

  fastify.post('/unidades/:id/ocupantes', async (request, reply) => {
    const { id } = request.params as { id: string }
    const parsed = CreateVinculoBody.safeParse(request.body)
    if (!parsed.success) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: parsed.error.errors[0].message },
      })
    }
    const { pessoa_id, tipo_vinculo, principal } = parsed.data
    const db = request.tenantDb!
    const usuarioId = (request.user as any).sub

    const unidade = await db.unsafe(`SELECT id FROM unidades WHERE id = $1`, [id])
    if (unidade.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Unidade não encontrada' },
      })
    }
    const pessoa = await db.unsafe(`SELECT id FROM pessoas WHERE id = $1`, [pessoa_id])
    if (pessoa.length === 0) {
      return reply.status(400).send({
        erro: { codigo: 'PESSOA_INVALIDA', mensagem: 'Pessoa não encontrada' },
      })
    }

    const vinculoId = uuidv4()
    let created: Record<string, any>
    await db.unsafe('BEGIN')
    try {
      if (principal) {
        await db.unsafe(
          `UPDATE vinculos_unidade SET principal = false
           WHERE unidade_id = $1 AND principal = true AND ativo = true`,
          [id]
        )
      }
      const rows = await db.unsafe(
        `INSERT INTO vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo, principal, criado_por)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [vinculoId, pessoa_id, id, tipo_vinculo, principal, usuarioId]
      )
      created = rows[0] as Record<string, any>

      await registrarAuditoria(db, {
        usuario_id: usuarioId,
        acao: 'INSERT',
        tabela: 'vinculos_unidade',
        registro_id: vinculoId,
        dados_depois: created,
        ip: request.ip,
      })
      await db.unsafe('COMMIT')
    } catch (err) {
      await db.unsafe('ROLLBACK')
      throw err
    }

    return reply.status(201).send({ data: created })
  })

  // Encerrar um vínculo (soft: ativo=false, fim=NOW())
  fastify.delete('/unidades/:id/ocupantes/:vinculoId', async (request, reply) => {
    const { id, vinculoId } = request.params as { id: string; vinculoId: string }
    const db = request.tenantDb!

    const rows = await db.unsafe(
      `UPDATE vinculos_unidade
       SET ativo = false, fim = COALESCE(fim, NOW())
       WHERE id = $1 AND unidade_id = $2 AND ativo = true
       RETURNING *`,
      [vinculoId, id]
    )
    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Vínculo ativo não encontrado' },
      })
    }

    await registrarAuditoria(db, {
      usuario_id: (request.user as any).sub,
      acao: 'DELETE',
      tabela: 'vinculos_unidade',
      registro_id: vinculoId,
      dados_depois: rows[0] as Record<string, unknown>,
      ip: request.ip,
    })

    return reply.status(200).send({ data: rows[0] })
  })
}

export default unidadesRoutes
