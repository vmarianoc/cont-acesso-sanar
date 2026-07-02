import type postgres from 'postgres'

type ReservedSql = Awaited<ReturnType<postgres.Sql['reserve']>>

/** Reserva uma conexão do pool, fixa o search_path para o schema do tenant e a libera ao final. */
export async function withTenant<T>(
  sql: postgres.Sql,
  schemaName: string,
  fn: (reserved: ReservedSql) => Promise<T>
): Promise<T> {
  const reserved = await sql.reserve()
  try {
    await reserved.unsafe(`SET search_path TO ${schemaName}, public`)
    return await fn(reserved)
  } finally {
    try {
      await reserved.unsafe('SET search_path TO public')
    } catch {
      // ignore reset failures; connection is being returned to the pool
    }
    reserved.release()
  }
}
