import type { FastifyPluginAsync } from 'fastify'
import { registrarAuditoria } from '../services/auditoriaService.js'
import { enfileirarComandoFacial } from '../services/syncEdgeService.js'
import { PERFIS_GESTAO } from '../lib/perfis.js'

/**
 * Direitos do titular (LGPD art. 18) e relatórios de gestão:
 * - GET /morador/meus-dados: export completo dos dados do titular
 * - POST /pessoas/:id/anonimizar: apaga identificadores ao desligar a pessoa
 * - GET /relatorios/:tipo(.csv): acessos, reservas e ocorrências p/ assembleia
 */
const lgpdRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/morador/meus-dados', async (request, reply) => {
    const userId = (request.user as any).sub as string
    const db = request.tenantDb!
    const [pessoa] = await db.unsafe(
      `SELECT p.* FROM pessoas p JOIN usuarios_tenant ut ON ut.pessoa_id = p.id WHERE ut.id = $1`,
      [userId]
    )
    if (!pessoa) {
      return reply.status(404).send({
        erro: { codigo: 'SEM_PESSOA', mensagem: 'Usuário sem pessoa vinculada' },
      })
    }
    const [vinculos, veiculos, pets, reservas, eventos, notificacoes] = await Promise.all([
      db.unsafe(
        `SELECT v.tipo_vinculo, v.principal, v.ativo, v.inicio, v.fim, u.numero AS unidade
         FROM vinculos_unidade v JOIN unidades u ON u.id = v.unidade_id WHERE v.pessoa_id = $1`,
        [pessoa.id]
      ),
      db.unsafe(`SELECT placa, modelo, cor, vaga, ativo FROM veiculos WHERE pessoa_id = $1`, [pessoa.id]),
      db.unsafe(`SELECT nome, especie, raca FROM pets WHERE pessoa_id = $1`, [pessoa.id]),
      db.unsafe(`SELECT data, periodo, status FROM reservas WHERE pessoa_id = $1`, [pessoa.id]),
      db.unsafe(
        `SELECT tipo, resultado, metodo, criado_em FROM eventos WHERE pessoa_id = $1 ORDER BY criado_em DESC LIMIT 500`,
        [pessoa.id]
      ),
      db.unsafe(
        `SELECT titulo, mensagem, criado_em FROM notificacoes WHERE pessoa_id = $1 ORDER BY criado_em DESC LIMIT 200`,
        [pessoa.id]
      ),
    ])
    await registrarAuditoria(db, {
      usuario_id: userId,
      acao: 'lgpd.exportar_dados',
      tabela: 'pessoas',
      registro_id: pessoa.id,
      ip: request.ip,
    })
    return reply.status(200).send({
      data: { pessoa, vinculos, veiculos, pets, reservas, eventos, notificacoes },
    })
  })

  fastify.post('/pessoas/:id/anonimizar', async (request, reply) => {
    const perfil = (request.user as any).perfil as string
    if (!PERFIS_GESTAO.has(perfil)) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas síndico ou administrador anonimizam dados' },
      })
    }
    const { id } = request.params as { id: string }
    const db = request.tenantDb!

    const [vinculoAtivo] = await db.unsafe(
      `SELECT id FROM vinculos_unidade WHERE pessoa_id = $1 AND ativo = true LIMIT 1`,
      [id]
    )
    if (vinculoAtivo) {
      return reply.status(409).send({
        erro: { codigo: 'VINCULO_ATIVO', mensagem: 'Encerre os vínculos antes de anonimizar' },
      })
    }

    const [antes] = await db.unsafe(`SELECT * FROM pessoas WHERE id = $1`, [id])
    if (!antes) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADA', mensagem: 'Pessoa não encontrada' },
      })
    }

    await db.unsafe('BEGIN')
    try {
      const rows = await db.unsafe(
        `UPDATE pessoas SET nome = 'Ex-morador (anonimizado)', cpf = NULL, rg = NULL,
                foto_url = NULL, email = NULL, telefone = NULL, ativo = false, atualizado_em = NOW()
         WHERE id = $1 RETURNING *`,
        [id]
      )
      await enfileirarComandoFacial(db, 'pessoa.remover', id)
      await db.unsafe(`DELETE FROM biometrias WHERE pessoa_id = $1`, [id])
      await db.unsafe(`UPDATE usuarios_tenant SET ativo = false WHERE pessoa_id = $1`, [id])
      await registrarAuditoria(db, {
        usuario_id: (request.user as any).sub,
        acao: 'lgpd.anonimizar',
        tabela: 'pessoas',
        registro_id: id,
        dados_antes: { nome: antes.nome },
        dados_depois: rows[0],
        ip: request.ip,
      })
      await db.unsafe('COMMIT')
      return reply.status(200).send({ data: rows[0] })
    } catch (err) {
      await db.unsafe('ROLLBACK')
      throw err
    }
  })

  // ---- Relatórios CSV para o síndico ----
  const RELATORIOS: Record<string, { titulo: string; sql: string }> = {
    acessos: {
      titulo: 'data,pessoa,tipo,resultado,metodo',
      sql: `SELECT to_char(e.criado_em, 'YYYY-MM-DD HH24:MI') AS c1, COALESCE(p.nome,'-') AS c2,
                   e.tipo AS c3, e.resultado AS c4, e.metodo AS c5
            FROM eventos e LEFT JOIN pessoas p ON p.id = e.pessoa_id
            WHERE e.criado_em > NOW() - INTERVAL '90 days' ORDER BY e.criado_em DESC LIMIT 5000`,
    },
    reservas: {
      titulo: 'data,espaco,periodo,morador,status',
      sql: `SELECT to_char(r.data, 'YYYY-MM-DD') AS c1, e.nome AS c2, COALESCE(r.periodo,'-') AS c3,
                   p.nome AS c4, r.status AS c5
            FROM reservas r JOIN espacos e ON e.id = r.espaco_id JOIN pessoas p ON p.id = r.pessoa_id
            ORDER BY r.data DESC LIMIT 5000`,
    },
    ocorrencias: {
      titulo: 'aberta_em,titulo,categoria,status,unidade',
      sql: `SELECT to_char(o.criado_em, 'YYYY-MM-DD HH24:MI') AS c1, o.titulo AS c2, o.categoria AS c3,
                   o.status AS c4, COALESCE(u.numero,'-') AS c5
            FROM ocorrencias o LEFT JOIN unidades u ON u.id = o.unidade_id
            ORDER BY o.criado_em DESC LIMIT 5000`,
    },
  }

  fastify.get('/relatorios/:tipo', async (request, reply) => {
    const perfil = (request.user as any).perfil as string
    if (!PERFIS_GESTAO.has(perfil)) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas síndico ou administrador exportam relatórios' },
      })
    }
    const tipo = (request.params as { tipo: string }).tipo.replace(/\.csv$/, '')
    const rel = RELATORIOS[tipo]
    if (!rel) {
      return reply.status(404).send({
        erro: { codigo: 'RELATORIO_INEXISTENTE', mensagem: `Tipos: ${Object.keys(RELATORIOS).join(', ')}` },
      })
    }
    const rows = await request.tenantDb!.unsafe(rel.sql)
    const esc = (v: unknown) => {
      const s = String(v ?? '')
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
    }
    const csv = [rel.titulo, ...rows.map((r: any) => [r.c1, r.c2, r.c3, r.c4, r.c5].map(esc).join(','))].join('\n')
    reply.header('content-type', 'text/csv; charset=utf-8')
    reply.header('content-disposition', `attachment; filename="${tipo}.csv"`)
    return reply.send(csv)
  })

  // ---- Consentimento LGPD (primeiro acesso) ----
  fastify.post('/lgpd/consentimento', async (request, reply) => {
    const userId = (request.user as any).sub as string
    const rows = await request.tenantDb!.unsafe(
      `UPDATE usuarios_tenant SET consentimento_em = COALESCE(consentimento_em, NOW())
       WHERE id = $1 RETURNING consentimento_em`,
      [userId]
    )
    return reply.status(200).send({ data: { consentimento_em: rows[0]?.consentimento_em } })
  })

  fastify.get('/lgpd/consentimento', async (request, reply) => {
    const userId = (request.user as any).sub as string
    const [row] = await request.tenantDb!.unsafe(
      `SELECT consentimento_em FROM usuarios_tenant WHERE id = $1`,
      [userId]
    )
    return reply.status(200).send({ data: { consentimento_em: row?.consentimento_em ?? null } })
  })
}

export default lgpdRoutes
