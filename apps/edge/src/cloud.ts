import { createHash } from 'node:crypto'
import { hostname, networkInterfaces } from 'node:os'
import pino from 'pino'
import type { EdgeConfig } from './config.js'

const log = pino({ name: 'edge-cloud' })

/** Identidade do hardware para o vínculo da licença. */
export function fingerprint(): string {
  const macs = Object.values(networkInterfaces())
    .flat()
    .filter((i) => i && !i.internal && i.mac !== '00:00:00:00:00:00')
    .map((i) => i!.mac)
    .sort()
  return createHash('sha256').update(`${hostname()}|${macs.join(',')}`).digest('hex').slice(0, 32)
}

/**
 * Cliente autenticado da Cloud API: faz login com o usuário do Edge, renova o
 * token quando expira e expõe os endpoints /edge/*. Toda falha de rede vira
 * exceção — quem decide o modo degradado é o chamador.
 */
export class CloudClient {
  private token: string | null = null
  constructor(private cfg: EdgeConfig) {}

  private async login(): Promise<void> {
    const res = await fetch(`${this.cfg.cloud_url}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: this.cfg.email, senha: this.cfg.senha, tenant_id: this.cfg.tenant_id }),
    })
    if (!res.ok) throw new Error(`login do Edge falhou: ${res.status}`)
    this.token = ((await res.json()) as any).data.token
    log.info('sessão do Edge autenticada na Cloud')
  }

  private async req(metodo: string, caminho: string, body?: unknown, tentativa = 0): Promise<any> {
    if (!this.token) await this.login()
    const res = await fetch(`${this.cfg.cloud_url}${caminho}`, {
      method: metodo,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.token}` },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    if (res.status === 401 && tentativa === 0) {
      this.token = null
      return this.req(metodo, caminho, body, 1)
    }
    const json = (await res.json()) as any
    if (!res.ok) throw new Error(json?.erro?.mensagem ?? `HTTP ${res.status} em ${caminho}`)
    return json.data
  }

  async validarLicenca() {
    const res = await fetch(`${this.cfg.cloud_url}/edge/validate-license`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ license_key: this.cfg.license_key, fingerprint: fingerprint() }),
    })
    const json = (await res.json()) as any
    if (!res.ok) throw new Error(json?.erro?.mensagem ?? `licença: HTTP ${res.status}`)
    return json.data
  }

  validarPlaca(dispositivo_id: string, placa: string) {
    return this.req('POST', '/edge/lpr', { schema_name: this.cfg.schema_name, dispositivo_id, placa })
  }

  validarFacial(dispositivo_id: string, pessoa_id: string) {
    return this.req('POST', '/edge/validate-access', {
      schema_name: this.cfg.schema_name,
      dispositivo_id,
      pessoa_id,
      metodo: 'facial',
    })
  }

  validarQr(dispositivo_id: string, qr_token: string) {
    return this.req('POST', '/edge/qr', { schema_name: this.cfg.schema_name, dispositivo_id, qr_token })
  }

  buscarPlacas(): Promise<Record<string, string>> {
    return this.req('GET', `/edge/sync/placas?schema_name=${this.cfg.schema_name}`)
  }

  buscarComandos(dispositivo_id: string) {
    return this.req(
      'GET',
      `/edge/sync/comandos?dispositivo_id=${dispositivo_id}&schema_name=${this.cfg.schema_name}`
    )
  }

  ackComando(id: string, sucesso: boolean) {
    return this.req('POST', `/edge/sync/comandos/${id}/ack`, {
      schema_name: this.cfg.schema_name,
      sucesso,
    })
  }

  enviarEventos(eventos: unknown[]) {
    return this.req('POST', '/edge/sync/eventos', {
      tenant_id: this.cfg.tenant_id,
      schema_name: this.cfg.schema_name,
      eventos,
    })
  }

  heartbeat(dispositivo_id: string, status: 'online' | 'degradado') {
    return this.req('POST', '/edge/sync/heartbeat', {
      dispositivo_id,
      tenant_id: this.cfg.tenant_id,
      schema_name: this.cfg.schema_name,
      status,
    })
  }
}
