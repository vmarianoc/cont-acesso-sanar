import type { FastifyPluginAsync } from 'fastify'
import { v4 as uuidv4 } from 'uuid'
import { registrarAuditoria } from '../services/auditoriaService.js'
import { PERFIS_GESTAO } from '../lib/perfis.js'
const TAMANHO_MAX = 10 * 1024 * 1024 // 10 MB

/**
 * Documentos do condomínio: convenção/atas para todos, ou restritos a um
 * grupo (ex.: conselho fiscal). O filtro de escopo vale para listagem E
 * download — quem não é membro do grupo não enxerga o documento.
 */

async function pessoaDoUsuario(db: any, userId: string): Promise<string | null> {
  const [row] = await db.unsafe(`SELECT pessoa_id FROM usuarios_tenant WHERE id = $1`, [userId])
  return row?.pessoa_id ?? null
}

const filtroEscopo = (gestor: boolean) =>
  gestor
    ? 'true'
    : `(d.escopo = 'todos' OR (d.escopo = 'grupo' AND EXISTS (
         SELECT 1 FROM grupo_membros gm WHERE gm.grupo_id = d.grupo_id AND gm.pessoa_id = $1
       )))`

const documentosRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', fastify.authenticate)

  fastify.get('/documentos', async (request, reply) => {
    const perfil = (request.user as any).perfil as string
    const gestor = PERFIS_GESTAO.has(perfil)
    const pessoaId = await pessoaDoUsuario(request.tenantDb!, (request.user as any).sub)

    const rows = await request.tenantDb!.unsafe(
      `SELECT d.id, d.titulo, d.descricao, d.arquivo_nome, d.mime, d.tamanho,
              d.escopo, d.grupo_id, d.criado_em, g.nome AS grupo_nome
       FROM documentos d
       LEFT JOIN grupos g ON g.id = d.grupo_id
       WHERE ${filtroEscopo(gestor)}
       ORDER BY d.criado_em DESC
       LIMIT 200`,
      gestor ? [] : [pessoaId]
    )
    return reply.status(200).send({ data: rows })
  })

  fastify.get('/documentos/:id/download', async (request, reply) => {
    const { id } = request.params as { id: string }
    const perfil = (request.user as any).perfil as string
    const gestor = PERFIS_GESTAO.has(perfil)
    const pessoaId = await pessoaDoUsuario(request.tenantDb!, (request.user as any).sub)

    const rows = await request.tenantDb!.unsafe(
      `SELECT d.* FROM documentos d WHERE d.id = ${gestor ? '$1' : '$2'} AND ${filtroEscopo(gestor)}`,
      gestor ? [id] : [pessoaId, id]
    )
    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Documento não encontrado' },
      })
    }
    const doc = rows[0]
    reply.header('content-type', doc.mime)
    reply.header('content-disposition', `attachment; filename="${encodeURIComponent(doc.arquivo_nome)}"`)
    return reply.send(doc.conteudo)
  })

  fastify.post('/documentos', async (request, reply) => {
    const perfil = (request.user as any).perfil as string
    if (!PERFIS_GESTAO.has(perfil)) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas síndico ou administrador publicam documentos' },
      })
    }

    const file = await (request as any).file()
    if (!file) {
      return reply.status(400).send({
        erro: { codigo: 'ARQUIVO_FALTANDO', mensagem: 'Envie o arquivo no campo "file"' },
      })
    }
    const buffer: Buffer = await file.toBuffer()
    if (buffer.length > TAMANHO_MAX) {
      return reply.status(413).send({
        erro: { codigo: 'ARQUIVO_GRANDE', mensagem: 'Arquivo acima de 10 MB' },
      })
    }

    const campos = file.fields as Record<string, any>
    const valor = (k: string) => (campos[k]?.value as string | undefined)?.trim() || undefined
    const titulo = valor('titulo') ?? file.filename
    const escopo = valor('escopo') === 'grupo' ? 'grupo' : 'todos'
    const grupoId = valor('grupo_id')
    if (escopo === 'grupo' && !grupoId) {
      return reply.status(400).send({
        erro: { codigo: 'DADOS_INVALIDOS', mensagem: 'Documento de grupo exige grupo_id' },
      })
    }

    const rows = await request.tenantDb!.unsafe(
      `INSERT INTO documentos (id, titulo, descricao, arquivo_nome, mime, tamanho, conteudo, escopo, grupo_id, publicado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, titulo, descricao, arquivo_nome, mime, tamanho, escopo, grupo_id, criado_em`,
      [
        uuidv4(),
        titulo,
        valor('descricao') ?? null,
        file.filename,
        file.mimetype,
        buffer.length,
        buffer,
        escopo,
        escopo === 'grupo' ? grupoId : null,
        (request.user as any).sub,
      ]
    )

    await registrarAuditoria(request.tenantDb!, {
      usuario_id: (request.user as any).sub,
      acao: 'documento.publicar',
      tabela: 'documentos',
      registro_id: rows[0].id,
      dados_depois: rows[0],
      ip: request.ip,
    })
    return reply.status(201).send({ data: rows[0] })
  })

  fastify.delete('/documentos/:id', async (request, reply) => {
    const perfil = (request.user as any).perfil as string
    if (!PERFIS_GESTAO.has(perfil)) {
      return reply.status(403).send({
        erro: { codigo: 'ACESSO_NEGADO', mensagem: 'Apenas síndico ou administrador removem documentos' },
      })
    }
    const { id } = request.params as { id: string }
    const rows = await request.tenantDb!.unsafe(
      `DELETE FROM documentos WHERE id = $1
       RETURNING id, titulo, arquivo_nome, escopo, grupo_id`,
      [id]
    )
    if (rows.length === 0) {
      return reply.status(404).send({
        erro: { codigo: 'NAO_ENCONTRADO', mensagem: 'Documento não encontrado' },
      })
    }
    await registrarAuditoria(request.tenantDb!, {
      usuario_id: (request.user as any).sub,
      acao: 'documento.remover',
      tabela: 'documentos',
      registro_id: id,
      dados_antes: rows[0],
      ip: request.ip,
    })
    return reply.status(200).send({ data: rows[0] })
  })
}

export default documentosRoutes
