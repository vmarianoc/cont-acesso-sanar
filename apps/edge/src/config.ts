import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export interface DispositivoEdge {
  dispositivo_id: string
  tipo: 'lpr' | 'facial'
  nome: string
  ip: string
  usuario: string
  senha: string
}

export interface EdgeConfig {
  cloud_url: string
  tenant_id: string
  schema_name: string
  license_key: string
  email: string
  senha: string
  lpr_listen_port: number
  heartbeat_seg: number
  sync_seg: number
  dispositivos: DispositivoEdge[]
}

export function carregarConfig(): EdgeConfig {
  const caminho = resolve(process.env.EDGE_CONFIG ?? 'edge.config.json')
  const cfg = JSON.parse(readFileSync(caminho, 'utf8')) as EdgeConfig
  for (const campo of ['cloud_url', 'tenant_id', 'schema_name', 'license_key', 'email', 'senha'] as const) {
    if (!cfg[campo]) throw new Error(`edge.config.json: campo obrigatório ausente: ${campo}`)
  }
  cfg.lpr_listen_port ??= 8090
  cfg.heartbeat_seg ??= 60
  cfg.sync_seg ??= 15
  cfg.dispositivos ??= []
  return cfg
}
