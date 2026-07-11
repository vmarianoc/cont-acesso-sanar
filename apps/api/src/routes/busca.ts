import type { FastifyPluginAsync } from 'fastify'

const PERFIS_OPERACAO = new Set(['porteiro', 'admin', 'sindico', 'superadmin'])

/**
 * Busca unificada da portaria: nome de pessoa, número de unidade, placa de
 * veículo ou documento — a pergunta mais comum da guarita ("de quem é o carro
 * ABC1D23?", "quem mora no 302?") respondida num único campo.
 */
const buscaRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/busca', async (request, reply) => {
    const perfil = (request.user as any).perfil as string
    if (!PERFIS_OPERACAO.has(perfil)) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Busca disponível para portaria e gestão' },
      })
    }
    const { q } = request.query as { q?: string }
    if (!q || q.trim().length < 2) {
      return reply.status(200).send({ data: [] })
    }
    const termo = `%${q.trim()}%`
    const doc = `%${q.replace(/\D/g, '')}%`

    const rows = await request.tenantDb!.unsafe(
      `
      SELECT 'pessoa' AS tipo, p.id, p.nome AS titulo,
             COALESCE('Unidade ' || u.numero, p.tipo) AS detalhe
      FROM pessoas p
      LEFT JOIN vinculos_unidade v ON v.pessoa_id = p.id AND v.ativo = true
      LEFT JOIN unidades u ON u.id = v.unidade_id
      WHERE p.nome ILIKE $1 OR ($2 <> '%%' AND p.cpf LIKE $2)

      UNION ALL
      SELECT 'veiculo' AS tipo, ve.id, ve.placa || COALESCE(' — ' || ve.modelo, '') AS titulo,
             p2.nome || COALESCE(' · Unidade ' || u2.numero, '') ||
             COALESCE(' · vaga ' || ve.vaga, '') AS detalhe
      FROM veiculos ve
      JOIN pessoas p2 ON p2.id = ve.pessoa_id
      LEFT JOIN vinculos_unidade v2 ON v2.pessoa_id = p2.id AND v2.ativo = true
      LEFT JOIN unidades u2 ON u2.id = v2.unidade_id
      WHERE ve.placa ILIKE $1

      UNION ALL
      SELECT 'unidade' AS tipo, un.id, 'Unidade ' || un.numero AS titulo,
             b.nome || ' · ' || COALESCE(string_agg(p3.nome, ', '), 'sem ocupantes') AS detalhe
      FROM unidades un
      JOIN blocos b ON b.id = un.bloco_id
      LEFT JOIN vinculos_unidade v3 ON v3.unidade_id = un.id AND v3.ativo = true
      LEFT JOIN pessoas p3 ON p3.id = v3.pessoa_id
      WHERE un.numero ILIKE $1
      GROUP BY un.id, un.numero, b.nome

      UNION ALL
      SELECT 'pet' AS tipo, pt.id, pt.nome || ' (' || pt.especie || ')' AS titulo,
             p4.nome || COALESCE(' · Unidade ' || u4.numero, '') AS detalhe
      FROM pets pt
      JOIN pessoas p4 ON p4.id = pt.pessoa_id
      LEFT JOIN unidades u4 ON u4.id = pt.unidade_id
      WHERE pt.nome ILIKE $1

      LIMIT 30`,
      [termo, doc]
    )
    return reply.status(200).send({ data: rows })
  })
}

export default buscaRoutes
