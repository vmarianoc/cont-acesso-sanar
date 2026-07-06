import { v4 as uuidv4 } from 'uuid'
import type postgres from 'postgres'

type Sql = postgres.Sql<{}> | postgres.TransactionSql<{}> | postgres.ReservedSql<{}>

export interface NovaLiberacao {
  pessoa_id?: string | null
  visitante_id?: string | null
  area: string
  metodo?: 'facial' | 'qrcode' | 'biometria' | 'manual'
  valido_de: string | Date
  valido_ate: string | Date
  origem_tipo?: 'reserva' | 'visitante' | 'manual'
  origem_id?: string | null
  criado_por?: string | null
  recorrencia?: { dias?: number[]; hora_inicio?: string; hora_fim?: string } | null
}

export async function criarLiberacao(sql: Sql, l: NovaLiberacao) {
  const rows = await sql.unsafe(
    `INSERT INTO liberacoes_acesso
       (id, pessoa_id, visitante_id, area, metodo, valido_de, valido_ate, origem_tipo, origem_id, criado_por, recorrencia)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
     RETURNING *`,
    [
      uuidv4(),
      l.pessoa_id ?? null,
      l.visitante_id ?? null,
      l.area,
      l.metodo ?? 'facial',
      l.valido_de,
      l.valido_ate,
      l.origem_tipo ?? 'manual',
      l.origem_id ?? null,
      l.criado_por ?? null,
      l.recorrencia ? JSON.stringify(l.recorrencia) : null,
    ]
  )
  return rows[0]
}

export interface ValidacaoAcesso {
  resultado: 'liberado' | 'negado'
  motivo: string
  area: string
  liberacao_id?: string
}

/**
 * Regras de acesso facial por área:
 * 1. Morador com vínculo ativo entra na área "portaria" (acesso residencial).
 * 2. Qualquer outra área exige liberação vigente (gerada por reserva,
 *    pré-autorização de visitante ou manual).
 * O evento é sempre registrado (LGPD/auditoria de acesso físico).
 */
export async function validarAcessoFacial(
  sql: Sql,
  params: { dispositivo_id: string; pessoa_id?: string | null; visitante_id?: string | null }
): Promise<ValidacaoAcesso> {
  const [dispositivo] = await sql.unsafe(
    `SELECT id, area, ativo FROM dispositivos WHERE id = $1`,
    [params.dispositivo_id]
  )
  if (!dispositivo) return { resultado: 'negado', motivo: 'DISPOSITIVO_DESCONHECIDO', area: '' }
  const area: string = dispositivo.area

  // 1) liberação vigente para a área (pessoa ou visitante); liberações
  // recorrentes (ex.: diarista toda terça 8h–17h) ainda exigem que o momento
  // atual caia no dia-da-semana e faixa horária configurados.
  const liberacoes = await sql.unsafe(
    `SELECT id, recorrencia FROM liberacoes_acesso
     WHERE area = $1 AND ativo = true
       AND NOW() BETWEEN valido_de AND valido_ate
       AND ((pessoa_id IS NOT NULL AND pessoa_id = $2) OR (visitante_id IS NOT NULL AND visitante_id = $3))
     ORDER BY valido_ate DESC`,
    [area, params.pessoa_id ?? null, params.visitante_id ?? null]
  )
  const agora = new Date()
  const diaIso = ((agora.getDay() + 6) % 7) + 1 // 1=segunda … 7=domingo
  const horaAtual = agora.toTimeString().slice(0, 5)
  const liberacao = liberacoes.find((l: any) => {
    if (!l.recorrencia) return true
    const r = (typeof l.recorrencia === 'string' ? JSON.parse(l.recorrencia) : l.recorrencia) as {
      dias?: number[]
      hora_inicio?: string
      hora_fim?: string
    }
    if (r.dias?.length && !r.dias.includes(diaIso)) return false
    if (r.hora_inicio && horaAtual < r.hora_inicio) return false
    if (r.hora_fim && horaAtual > r.hora_fim) return false
    return true
  })
  if (liberacao) {
    return { resultado: 'liberado', motivo: 'LIBERACAO_VIGENTE', area, liberacao_id: liberacao.id }
  }

  // 2) morador com vínculo ativo tem acesso residencial (área "portaria")
  if (area === 'portaria' && params.pessoa_id) {
    const [vinculo] = await sql.unsafe(
      `SELECT id FROM vinculos_unidade WHERE pessoa_id = $1 AND ativo = true LIMIT 1`,
      [params.pessoa_id]
    )
    if (vinculo) return { resultado: 'liberado', motivo: 'MORADOR_ATIVO', area }
  }

  return { resultado: 'negado', motivo: 'SEM_LIBERACAO_PARA_AREA', area }
}

export async function registrarEventoAcesso(
  sql: Sql,
  params: {
    dispositivo_id: string
    pessoa_id?: string | null
    resultado: 'liberado' | 'negado'
    metodo?: string
  }
) {
  await sql.unsafe(
    `INSERT INTO eventos (id, dispositivo_id, pessoa_id, tipo, resultado, metodo)
     VALUES ($1, $2, $3, 'acesso_area', $4, $5)`,
    [uuidv4(), params.dispositivo_id, params.pessoa_id ?? null, params.resultado, params.metodo ?? 'facial']
  )
}
