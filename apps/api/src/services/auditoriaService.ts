import type postgres from 'postgres'

type SqlExecutor = postgres.Sql<{}> | postgres.TransactionSql<{}> | postgres.ReservedSql<{}>

export interface RegistroAuditoria {
  usuario_id: string | null
  acao: string
  tabela: string
  registro_id: string | null
  dados_antes?: Record<string, unknown> | null
  dados_depois?: Record<string, unknown> | null
  ip?: string | null
}

export async function registrarAuditoria(
  sql: SqlExecutor,
  registro: RegistroAuditoria
): Promise<void> {
  await sql.unsafe(
    `INSERT INTO auditoria (usuario_id, acao, tabela, registro_id, dados_antes, dados_depois, ip)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      registro.usuario_id,
      registro.acao,
      registro.tabela,
      registro.registro_id,
      registro.dados_antes ? sql.json(registro.dados_antes as any) : null,
      registro.dados_depois ? sql.json(registro.dados_depois as any) : null,
      registro.ip ?? null,
    ] as any
  )
}
