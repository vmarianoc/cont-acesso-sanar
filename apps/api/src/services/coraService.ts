/**
 * Integração com o Banco Cora (emissão de boleto/Pix de cobrança).
 *
 * Produção: exige CORA_BASE_URL, CORA_CLIENT_ID e mTLS (CORA_CERT_PATH /
 * CORA_KEY_PATH) — a Cora autentica por certificado + client_id (fluxo
 * "Integração Direta", endpoint /v2/invoices).
 * Sem credenciais configuradas, opera em MODO STUB: gera identificadores e
 * linha digitável fictícios para desenvolvimento/homologação, mantendo o
 * mesmo contrato de dados.
 */
import { randomUUID } from 'node:crypto'

export interface CobrancaEmitida {
  cora_invoice_id: string
  linha_digitavel: string
  pix_copia_cola: string
  stub: boolean
}

export interface DadosCobranca {
  tenant_nome: string
  valor_centavos: number
  vencimento: string // YYYY-MM-DD
  competencia: string
}

const configurado = () =>
  Boolean(process.env.CORA_BASE_URL && process.env.CORA_CLIENT_ID && process.env.CORA_CERT_PATH && process.env.CORA_KEY_PATH)

async function tokenCora(): Promise<string> {
  const { readFileSync } = await import('node:fs')
  const { Agent, fetch } = await import('undici')
  const agent = new Agent({
    connect: {
      cert: readFileSync(process.env.CORA_CERT_PATH!),
      key: readFileSync(process.env.CORA_KEY_PATH!),
    },
  })
  const res = await fetch(`${process.env.CORA_BASE_URL}/token`, {
    method: 'POST',
    dispatcher: agent,
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: `grant_type=client_credentials&client_id=${process.env.CORA_CLIENT_ID}`,
  })
  if (!res.ok) throw new Error(`Cora token: HTTP ${res.status}`)
  const data: any = await res.json()
  return data.access_token
}

export async function emitirCobrancaCora(
  dados: DadosCobranca,
  log: { info: (o: unknown, m?: string) => void; warn: (o: unknown, m?: string) => void }
): Promise<CobrancaEmitida> {
  if (!configurado()) {
    log.info({ dados }, 'Cora não configurado — cobrança emitida em modo stub')
    const fake = randomUUID().replace(/-/g, '').slice(0, 20)
    return {
      cora_invoice_id: `stub-${randomUUID()}`,
      linha_digitavel: `00190.00009 0${fake.slice(0, 4)}.${fake.slice(4, 10)} ${fake.slice(10, 15)}.${fake.slice(15, 20)}1 1 00000000000000`,
      pix_copia_cola: `00020126580014BR.GOV.BCB.PIX-STUB-${fake}`,
      stub: true,
    }
  }

  const { readFileSync } = await import('node:fs')
  const { Agent, fetch } = await import('undici')
  const agent = new Agent({
    connect: {
      cert: readFileSync(process.env.CORA_CERT_PATH!),
      key: readFileSync(process.env.CORA_KEY_PATH!),
    },
  })
  const token = await tokenCora()
  const res = await fetch(`${process.env.CORA_BASE_URL}/v2/invoices`, {
    method: 'POST',
    dispatcher: agent,
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
      'idempotency-key': randomUUID(),
    },
    body: JSON.stringify({
      code: `condar-${dados.competencia}`,
      customer: { name: dados.tenant_nome },
      services: [
        {
          name: `condar — licença ${dados.competencia}`,
          amount: dados.valor_centavos,
        },
      ],
      payment_terms: { due_date: dados.vencimento },
      payment_forms: ['BANK_SLIP', 'PIX'],
    }),
  })
  if (!res.ok) throw new Error(`Cora invoice: HTTP ${res.status} ${await res.text()}`)
  const inv: any = await res.json()
  return {
    cora_invoice_id: inv.id,
    linha_digitavel: inv.payment_options?.bank_slip?.digitable ?? '',
    pix_copia_cola: inv.pix?.emv ?? '',
    stub: false,
  }
}

/** Preço mensal por plano, em centavos. Sobrescreva via env PRECO_START etc. */
export const PRECO_PLANO_CENTAVOS: Record<string, number> = {
  start: parseInt(process.env.PRECO_START ?? '19900', 10),
  pro: parseInt(process.env.PRECO_PRO ?? '49900', 10),
  enterprise: parseInt(process.env.PRECO_ENTERPRISE ?? '99900', 10),
}
