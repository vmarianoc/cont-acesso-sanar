import client from './client'

export interface Evento {
  id: string
  dispositivo_id: string
  pessoa_id: string | null
  tipo: string
  resultado: 'liberado' | 'negado' | 'erro'
  metodo: 'facial' | 'qrcode' | 'biometria' | 'manual'
  foto_url: string | null
  foto_base64: string | null
  criado_em: string
  pessoa?: { nome: string }
}

export async function fetchEventos(limit = 30): Promise<Evento[]> {
  const res = await client.get(`/eventos?limit=${limit}`)
  return res.data.data
}

export async function registrarEvento(payload: {
  dispositivo_id: string
  pessoa_id?: string
  tipo: string
  resultado: 'liberado' | 'negado' | 'erro'
  metodo: 'facial' | 'qrcode' | 'biometria' | 'manual'
}): Promise<Evento> {
  const res = await client.post('/eventos', payload)
  return res.data.data
}
