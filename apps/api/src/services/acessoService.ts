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

export interface ValidacaoPlaca extends ValidacaoAcesso {
  placa: string
  pessoa_id?: string | null
  pessoa_nome?: string | null
}

/**
 * Acesso veicular por LPR (câmeras Intelbras): a câmera/Edge envia a placa
 * lida; a placa resolve o veículo ativo → pessoa, e valem as mesmas regras
 * de área do acesso facial. Placa desconhecida é sempre negada (e registrada).
 */
export async function validarAcessoPlaca(
  sql: Sql,
  params: { dispositivo_id: string; placa: string }
): Promise<ValidacaoPlaca> {
  const placa = params.placa.toUpperCase().replace(/[^A-Z0-9]/g, '')
  const [veiculo] = await sql.unsafe(
    `SELECT v.pessoa_id, p.nome
     FROM veiculos v JOIN pessoas p ON p.id = v.pessoa_id
     WHERE v.placa = $1 AND v.ativo = true AND p.ativo = true
     LIMIT 1`,
    [placa]
  )
  if (!veiculo) {
    const [disp] = await sql.unsafe(`SELECT area FROM dispositivos WHERE id = $1`, [params.dispositivo_id])
    return {
      resultado: 'negado',
      motivo: 'PLACA_DESCONHECIDA',
      area: disp?.area ?? '',
      placa,
    }
  }
  const validacao = await validarAcessoFacial(sql, {
    dispositivo_id: params.dispositivo_id,
    pessoa_id: veiculo.pessoa_id,
  })
  return { ...validacao, placa, pessoa_id: veiculo.pessoa_id, pessoa_nome: veiculo.nome }
}

export interface ValidacaoQr {
  resultado: 'liberado' | 'negado'
  motivo: string
  visitante?: {
    id: string
    nome: string
    documento: string | null
    unidade: string | null
    autorizado_por: string | null
    valido_de: string
    valido_ate: string
  }
}

/**
 * Valida o QR de convite do visitante (lido pelo facial Intelbras via Edge
 * ou digitado pelo porteiro). Sempre devolve os dados do visitante e de quem
 * liberou quando o token existe — a portaria confere na tela.
 */
export async function validarQrVisitante(sql: Sql, qrToken: string): Promise<ValidacaoQr> {
  const [v] = await sql.unsafe(
    `SELECT v.id, v.nome, v.documento, v.valido_de, v.valido_ate, v.usado,
            u.numero AS unidade, p.nome AS autorizado_por
     FROM visitantes v
     LEFT JOIN unidades u ON u.id = v.unidade_id
     LEFT JOIN pessoas p ON p.id = v.pre_autorizado_por
     WHERE v.qr_token = $1`,
    [qrToken.trim().toUpperCase()]
  )
  if (!v) return { resultado: 'negado', motivo: 'QR_DESCONHECIDO' }
  const visitante = {
    id: v.id,
    nome: v.nome,
    documento: v.documento,
    unidade: v.unidade,
    autorizado_por: v.autorizado_por,
    valido_de: v.valido_de,
    valido_ate: v.valido_ate,
  }
  const agora = new Date()
  if (agora < new Date(v.valido_de)) return { resultado: 'negado', motivo: 'FORA_DA_JANELA', visitante }
  if (agora > new Date(v.valido_ate)) return { resultado: 'negado', motivo: 'CONVITE_EXPIRADO', visitante }
  return { resultado: 'liberado', motivo: 'CONVITE_VALIDO', visitante }
}
