import { v4 as uuidv4 } from 'uuid'
import type postgres from 'postgres'

type Sql = postgres.Sql<{}> | postgres.TransactionSql<{}> | postgres.ReservedSql<{}>

/**
 * Enfileira um comando de cadastro facial para todos os controladores
 * faciais ativos do tenant. Vocabulário entendido pelo Edge (apps/edge):
 * pessoa.criar | pessoa.atualizar | pessoa.remover | face.atualizar.
 * O payload sempre carrega pessoa_id + nome; face.atualizar leva também
 * foto_base64 (a última biometria facial ativa).
 */
export async function enfileirarComandoFacial(
  sql: Sql,
  tipoComando: 'pessoa.criar' | 'pessoa.atualizar' | 'pessoa.remover' | 'face.atualizar',
  pessoaId: string,
  extras: Record<string, unknown> = {}
): Promise<number> {
  const [pessoa] = await sql.unsafe(`SELECT nome FROM pessoas WHERE id = $1`, [pessoaId])
  let foto_base64: string | null = null
  if (tipoComando === 'face.atualizar') {
    const [bio] = await sql.unsafe(
      `SELECT template FROM biometrias
       WHERE pessoa_id = $1 AND tipo = 'facial' AND ativo = true
       ORDER BY criado_em DESC LIMIT 1`,
      [pessoaId]
    )
    if (bio) foto_base64 = Buffer.from(bio.template).toString('base64')
  }
  const payload = {
    pessoa_id: pessoaId,
    nome: pessoa?.nome ?? '',
    ...(foto_base64 ? { foto_base64 } : {}),
    ...extras,
  }
  const dispositivos = await sql.unsafe(
    `SELECT id FROM dispositivos WHERE ativo = true AND tipo = 'leitor_facial'`
  )
  for (const disp of dispositivos) {
    await sql.unsafe(
      `INSERT INTO sync_queue (id, dispositivo_id, tipo_comando, payload) VALUES ($1, $2, $3, $4)`,
      [uuidv4(), disp.id, tipoComando, (sql as any).json(payload)]
    )
  }
  return dispositivos.length
}

/**
 * Convite facial de visitante (segunda forma além do QR): enfileira a face
 * do visitante em todos os controladores faciais ativos, com validade
 * (`valido_de`/`valido_ate`) — o Edge aplica a janela no próprio equipamento
 * e remove a face automaticamente ao expirar (funciona mesmo offline).
 */
export async function enfileirarComandoFacialVisitante(
  sql: Sql,
  visitanteId: string,
  fotoBase64: string,
  validoDe: string,
  validoAte: string
): Promise<number> {
  const [visitante] = await sql.unsafe(`SELECT nome FROM visitantes WHERE id = $1`, [visitanteId])
  const payload = {
    visitante_id: visitanteId,
    nome: visitante?.nome ?? '',
    foto_base64: fotoBase64,
    valido_de: validoDe,
    valido_ate: validoAte,
  }
  const dispositivos = await sql.unsafe(
    `SELECT id FROM dispositivos WHERE ativo = true AND tipo = 'leitor_facial'`
  )
  for (const disp of dispositivos) {
    await sql.unsafe(
      `INSERT INTO sync_queue (id, dispositivo_id, tipo_comando, payload) VALUES ($1, $2, 'visitante.face.criar', $3)`,
      [uuidv4(), disp.id, (sql as any).json(payload)]
    )
  }
  return dispositivos.length
}
