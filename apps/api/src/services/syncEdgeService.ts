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
