import type postgres from 'postgres'

type ReservedSql = Awaited<ReturnType<postgres.Sql['reserve']>>

export type PlanoNormalizado = 'start' | 'pro' | 'enterprise'

export interface LimitesPlano {
  maxUnidades: number | null // null = ilimitado
  maxDispositivos: number | null
}

export const LIMITES_PLANO: Record<PlanoNormalizado, LimitesPlano> = {
  start: { maxUnidades: 50, maxDispositivos: 4 },
  pro: { maxUnidades: 500, maxDispositivos: 32 },
  enterprise: { maxUnidades: null, maxDispositivos: null },
}

export function normalizarPlano(plano: string | null | undefined): PlanoNormalizado {
  const p = (plano ?? '').toLowerCase()
  if (p.includes('enter')) return 'enterprise'
  if (p.includes('pro') || p.includes('profiss')) return 'pro'
  return 'start'
}

export interface LicencaEfetiva {
  plano: PlanoNormalizado
  maxUnidades: number | null
  maxDispositivos: number | null
  ativa: boolean
  validade: Date | null
  expirada: boolean
}

/** Resolve a licença efetiva do tenant, com fallback aos limites padrão do plano. */
export async function getLicencaEfetiva(
  sql: postgres.Sql,
  tenantId: string
): Promise<LicencaEfetiva> {
  const licencas = await sql.unsafe<
    { plano: string; max_unidades: number; max_dispositivos: number; validade: Date | null; ativa: boolean }[]
  >(
    `SELECT plano, max_unidades, max_dispositivos, validade, ativa
     FROM public.licencas WHERE tenant_id = $1 ORDER BY criado_em DESC LIMIT 1`,
    [tenantId]
  )

  if (licencas[0]) {
    const l = licencas[0]
    const plano = normalizarPlano(l.plano)
    const ilimitado = plano === 'enterprise'
    return {
      plano,
      maxUnidades: ilimitado ? null : l.max_unidades,
      maxDispositivos: ilimitado ? null : l.max_dispositivos,
      ativa: l.ativa,
      validade: l.validade,
      expirada: !!l.validade && l.validade.getTime() < Date.now(),
    }
  }

  // Sem licença registrada: usa o plano do tenant como fallback.
  const tenants = await sql.unsafe<{ plano: string }[]>(
    `SELECT plano FROM public.tenants WHERE id = $1 LIMIT 1`,
    [tenantId]
  )
  const plano = normalizarPlano(tenants[0]?.plano)
  return {
    plano,
    ...LIMITES_PLANO[plano],
    ativa: true,
    validade: null,
    expirada: false,
  }
}

export async function contarUnidades(db: ReservedSql): Promise<number> {
  const rows = await db.unsafe<{ c: string }[]>(`SELECT count(*) AS c FROM unidades`)
  return Number(rows[0].c)
}

export async function contarDispositivos(db: ReservedSql): Promise<number> {
  const rows = await db.unsafe<{ c: string }[]>(`SELECT count(*) AS c FROM dispositivos`)
  return Number(rows[0].c)
}

/** Quantas unidades da importação ainda não existem no bloco alvo. */
export async function contarNovasNoImport(
  db: ReservedSql,
  condominioNome: string,
  blocoNome: string,
  numeros: string[]
): Promise<number> {
  const cond = await db.unsafe<{ id: string }[]>(
    `SELECT id FROM condominios WHERE nome = $1 LIMIT 1`,
    [condominioNome]
  )
  if (!cond[0]) return numeros.length
  const bloco = await db.unsafe<{ id: string }[]>(
    `SELECT id FROM blocos WHERE condominio_id = $1 AND nome = $2 LIMIT 1`,
    [cond[0].id, blocoNome]
  )
  if (!bloco[0]) return numeros.length
  const existentes = await db.unsafe<{ numero: string }[]>(
    `SELECT numero FROM unidades WHERE bloco_id = $1`,
    [bloco[0].id]
  )
  const set = new Set(existentes.map((e) => e.numero))
  return numeros.filter((n) => !set.has(n)).length
}

export class LicencaError extends Error {
  constructor(
    public codigo: string,
    message: string,
    public status = 409
  ) {
    super(message)
  }
}

/** Garante que criar `adicionais` unidades não excede o limite do plano. */
export function assegurarCapacidade(
  licenca: LicencaEfetiva,
  atual: number,
  adicionais: number
): void {
  if (!licenca.ativa) {
    throw new LicencaError('LICENCA_INATIVA', 'Licença suspensa. Regularize para continuar.', 403)
  }
  if (licenca.expirada) {
    throw new LicencaError('LICENCA_EXPIRADA', 'Licença expirada. Renove para continuar.', 403)
  }
  if (licenca.maxUnidades !== null && atual + adicionais > licenca.maxUnidades) {
    throw new LicencaError(
      'LIMITE_UNIDADES',
      `Limite do plano ${licenca.plano.toUpperCase()} atingido: ${licenca.maxUnidades} unidades ` +
        `(atual: ${atual}, tentando adicionar: ${adicionais}).`
    )
  }
}
