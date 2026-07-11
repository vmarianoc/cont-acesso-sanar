import type { FastifyPluginAsync } from 'fastify'
import { createHash } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'

/**
 * Atualização OTA dos Edges: o superadmin publica um pacote (tgz do
 * apps/edge) UMA vez; cada Edge verifica periodicamente, baixa, valida o
 * sha256 e se atualiza sozinho — com rollback automático se a versão nova
 * não subir. O painel mostra a versão de cada Edge (heartbeat/versao_fw).
 */

// versões semânticas simples: "1.4.0" > "1.3.9"
export function versaoMaisNova(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0)
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] ?? 0
    const db = pb[i] ?? 0
    if (da !== db) return da > db
  }
  return false
}

const edgeReleasesRoutes: FastifyPluginAsync = async (fastify) => {
  const exigirSuperadmin = (request: any, reply: any) => {
    if ((request.user?.perfil as string) !== 'superadmin') {
      reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas superadmin publica releases do Edge' },
      })
      return false
    }
    return true
  }

  /** Publica um release (multipart: campo "pacote" tgz + versao + notas). */
  fastify.post('/admin/edge/releases', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!exigirSuperadmin(request, reply)) return reply
    const partes = (request as any).parts()
    let versao = ''
    let notas = ''
    let pacote: Buffer | null = null
    for await (const parte of partes) {
      if (parte.type === 'file' && parte.fieldname === 'pacote') pacote = await parte.toBuffer()
      else if (parte.type === 'field' && parte.fieldname === 'versao') versao = String(parte.value).trim()
      else if (parte.type === 'field' && parte.fieldname === 'notas') notas = String(parte.value)
    }
    if (!versao || !/^\d+\.\d+\.\d+$/.test(versao) || !pacote || pacote.length === 0) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'Envie versao (x.y.z) e o pacote .tgz' },
      })
    }
    const sha256 = createHash('sha256').update(pacote).digest('hex')
    try {
      await fastify.db.unsafe(
        `INSERT INTO public.edge_releases (id, versao, notas, sha256, pacote, publicado_por)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [uuidv4(), versao, notas || null, sha256, pacote, (request.user as any).sub]
      )
    } catch (err: any) {
      if (String(err.message).includes('duplicate')) {
        return reply.status(409).send({
          erro: { codigo: 'VERSAO_EXISTE', mensagem: `Versão ${versao} já publicada` },
        })
      }
      throw err
    }
    return reply.status(201).send({ data: { versao, sha256, tamanho: pacote.length } })
  })

  /** Lista releases + a versão que cada Edge reportou no heartbeat. */
  fastify.get('/admin/edge/releases', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    if (!exigirSuperadmin(request, reply)) return reply
    const releases = await fastify.db.unsafe(
      `SELECT versao, notas, sha256, LENGTH(pacote) AS tamanho, publicado_por, criado_em
       FROM public.edge_releases ORDER BY criado_em DESC LIMIT 50`
    )
    // versão corrente de cada Edge: heartbeat grava versao_fw na sync_queue
    const tenants = await fastify.db.unsafe(`SELECT nome, schema_name FROM public.tenants WHERE ativo = true`)
    const edges: any[] = []
    for (const t of tenants as any[]) {
      const rows = await fastify.db.unsafe(
        `SELECT DISTINCT ON (dispositivo_id) versao_fw, status_dispositivo, ultimo_heartbeat
         FROM ${t.schema_name}.sync_queue
         WHERE ultimo_heartbeat IS NOT NULL
         ORDER BY dispositivo_id, ultimo_heartbeat DESC LIMIT 5`
      ).catch(() => [])
      const maisRecente = (rows as any[]).sort(
        (a, b) => new Date(b.ultimo_heartbeat).getTime() - new Date(a.ultimo_heartbeat).getTime()
      )[0]
      if (maisRecente) {
        edges.push({
          condominio: t.nome,
          versao: maisRecente.versao_fw,
          status: maisRecente.status_dispositivo,
          ultimo_heartbeat: maisRecente.ultimo_heartbeat,
        })
      }
    }
    return reply.status(200).send({ data: { releases, edges } })
  })

  /** Edge: existe versão mais nova que a minha? */
  fastify.get('/edge/update/check', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { versao } = request.query as { versao?: string }
    const [ultima] = await fastify.db.unsafe(
      `SELECT versao, sha256, notas FROM public.edge_releases ORDER BY criado_em DESC LIMIT 1`
    )
    if (!ultima || !versao || !versaoMaisNova(ultima.versao, versao)) {
      return reply.status(200).send({ data: { atualizar: false } })
    }
    return reply.status(200).send({
      data: { atualizar: true, versao: ultima.versao, sha256: ultima.sha256, notas: ultima.notas },
    })
  })

  /** Edge: download do pacote da versão. */
  fastify.get('/edge/update/download/:versao', { onRequest: [fastify.authenticate] }, async (request, reply) => {
    const { versao } = request.params as { versao: string }
    const [r] = await fastify.db.unsafe(
      `SELECT pacote FROM public.edge_releases WHERE versao = $1`,
      [versao]
    )
    if (!r) {
      return reply.status(404).send({ erro: { codigo: 'NAO_ENCONTRADA', mensagem: 'Versão não encontrada' } })
    }
    return reply
      .status(200)
      .header('content-type', 'application/gzip')
      .header('content-disposition', `attachment; filename="edge-${versao}.tgz"`)
      .send(Buffer.from(r.pacote))
  })
}

export default edgeReleasesRoutes
