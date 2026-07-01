import client from './client'

export interface Dispositivo {
  id: string
  nome: string
  tipo: string
  local: string | null
  ativo: boolean
}

export async function fetchDispositivos(): Promise<Dispositivo[]> {
  const res = await client.get('/dispositivos')
  return res.data.data
}
