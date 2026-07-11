import { readFileSync, writeFileSync, existsSync } from 'node:fs'

/**
 * Estado local do Edge para modo degradado: cache de placas autorizadas
 * (moradores ativos) e fila de eventos pendentes de envio à Cloud.
 * Persistido em JSON ao lado do config — simples e suficiente na guarita.
 */
export interface EventoPendente {
  dispositivo_id: string
  pessoa_id?: string
  tipo: string
  resultado: 'liberado' | 'negado' | 'erro'
  metodo: 'facial' | 'placa'
  ocorrido_em: string
}

interface Estado {
  placas: Record<string, string> // placa -> pessoa_id
  eventos_pendentes: EventoPendente[]
  // BioT exige UserID numérico; mapeamos cada pessoa_id (uuid) para um
  // número incremental estável deste Edge
  user_ids: Record<string, string> // pessoa_id -> UserID
  proximo_user_id: number
}

export class Store {
  private estado: Estado = { placas: {}, eventos_pendentes: [], user_ids: {}, proximo_user_id: 1 }
  constructor(private caminho = 'edge.state.json') {
    if (existsSync(this.caminho)) {
      try {
        this.estado = { user_ids: {}, proximo_user_id: 1, ...JSON.parse(readFileSync(this.caminho, 'utf8')) }
      } catch {
        /* estado corrompido: recomeça vazio */
      }
    }
  }

  private salvar() {
    writeFileSync(this.caminho, JSON.stringify(this.estado))
  }

  atualizarPlacas(placas: Record<string, string>) {
    this.estado.placas = placas
    this.salvar()
  }

  placaAutorizadaLocal(placa: string): string | null {
    return this.estado.placas[placa] ?? null
  }

  enfileirarEvento(ev: EventoPendente) {
    this.estado.eventos_pendentes.push(ev)
    if (this.estado.eventos_pendentes.length > 10000) this.estado.eventos_pendentes.shift()
    this.salvar()
  }

  eventosPendentes(): EventoPendente[] {
    return this.estado.eventos_pendentes
  }

  limparEventos(qtd: number) {
    this.estado.eventos_pendentes.splice(0, qtd)
    this.salvar()
  }

  /** UserID BioT da pessoa; cria um novo número na primeira vez. */
  userIdDe(pessoaId: string): string {
    if (!this.estado.user_ids[pessoaId]) {
      this.estado.user_ids[pessoaId] = String(this.estado.proximo_user_id++)
      this.salvar()
    }
    return this.estado.user_ids[pessoaId]
  }

  pessoaDeUserId(userId: string): string | null {
    for (const [pessoa, uid] of Object.entries(this.estado.user_ids)) {
      if (uid === userId) return pessoa
    }
    return null
  }
}
