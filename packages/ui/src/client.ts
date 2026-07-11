import axios from 'axios'

/**
 * Endereço da API: VITE_API_URL manda; sem ele, apps servidos sob *.condar.app
 * falam com https://api.condar.app e o dev local usa o proxy /api do Vite.
 */
export function apiBase(): string {
  const env = (import.meta as any).env?.VITE_API_URL
  if (env) return env
  if (typeof location !== 'undefined' && location.hostname.endsWith('condar.app')) {
    return 'https://api.condar.app'
  }
  return '/api'
}

const client = axios.create({
  baseURL: apiBase(),
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  // multi-unidade: contexto escolhido pelo morador no seletor do app
  const unidadeId = localStorage.getItem('unidadeId')
  if (unidadeId) config.headers['x-unidade-id'] = unidadeId
  return config
})

client.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true
      try {
        const res = await axios.post(
          `${apiBase()}/auth/refresh`,
          {},
          { withCredentials: true }
        )
        const token: string = res.data.data.token
        localStorage.setItem('token', token)
        original.headers.Authorization = `Bearer ${token}`
        return client(original)
      } catch {
        localStorage.removeItem('token')
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export default client
