/**
 * Extração da placa dos pushes ANPR das câmeras LPR Intelbras.
 * O push pode vir como JSON (ITSAPI/eventos inteligentes) ou como texto/XML
 * (notificação HTTP configurável) — cobrimos os formatos usuais procurando os
 * campos conhecidos e validando o padrão de placa BR (antiga e Mercosul).
 */
const PADRAO_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/

export function normalizarPlaca(bruta: string): string {
  return bruta.toUpperCase().replace(/[^A-Z0-9]/g, '')
}

export function extrairPlaca(corpo: string): string | null {
  // 1) JSON: procura chaves usuais em qualquer nível
  try {
    const achado = buscarChave(JSON.parse(corpo), [
      'PlateNumber', 'plateNumber', 'Plate', 'plate', 'placa', 'licensePlate', 'PlateNo',
    ])
    if (achado) {
      const placa = normalizarPlaca(achado)
      if (PADRAO_PLACA.test(placa)) return placa
    }
  } catch {
    /* não é JSON */
  }
  // 2) XML/texto: <plateNumber>ABC1D23</plateNumber> ou PlateNumber=ABC1D23
  const m = corpo.match(/plate(?:Number|No)?["'>=\s:]+([A-Za-z0-9-]{6,9})/i)
  if (m) {
    const placa = normalizarPlaca(m[1])
    if (PADRAO_PLACA.test(placa)) return placa
  }
  // 3) último recurso: qualquer token com formato de placa BR
  const solto = corpo.toUpperCase().match(/\b[A-Z]{3}-?[0-9][A-Z0-9][0-9]{2}\b/)
  if (solto) {
    const placa = normalizarPlaca(solto[0])
    if (PADRAO_PLACA.test(placa)) return placa
  }
  return null
}

function buscarChave(obj: unknown, chaves: string[]): string | null {
  if (obj === null || typeof obj !== 'object') return null
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (chaves.includes(k) && typeof v === 'string' && v.trim()) return v
    if (typeof v === 'object') {
      const achado = buscarChave(v, chaves)
      if (achado) return achado
    }
  }
  return null
}
