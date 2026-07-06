import postgres from 'postgres'

/**
 * Retenção LGPD: eventos de acesso e fotos com mais de RETENCAO_EVENTOS_DIAS
 * (default 365) são apagados diariamente em todos os schemas de tenant.
 * Dado sensível (art. 16): guardar apenas pelo tempo necessário.
 */
export function startRetencaoWorker() {
  const dias = parseInt(process.env.RETENCAO_EVENTOS_DIAS ?? '365', 10)
  const sql = postgres(process.env.DATABASE_URL!, { max: 2 })

  const rodar = async () => {
    const tenants = await sql`SELECT schema_name FROM tenants WHERE ativo = true`
    for (const t of tenants) {
      const apagados = await sql.unsafe(
        `DELETE FROM ${t.schema_name}.eventos WHERE criado_em < NOW() - INTERVAL '${dias} days'`
      )
      await sql.unsafe(
        `UPDATE ${t.schema_name}.visitantes SET foto_url = NULL
         WHERE foto_url IS NOT NULL AND criado_em < NOW() - INTERVAL '${dias} days'`
      )
      if (apagados.count > 0) {
        console.log(`[retencao] ${t.schema_name}: ${apagados.count} eventos além de ${dias} dias removidos`)
      }
    }
  }

  // roda no boot e a cada 24h
  rodar().catch((err) => console.error('[retencao] falha', err))
  const timer = setInterval(() => rodar().catch((err) => console.error('[retencao] falha', err)), 24 * 3600_000)

  return {
    shutdown: async () => {
      clearInterval(timer)
      await sql.end({ timeout: 5 })
    },
  }
}
