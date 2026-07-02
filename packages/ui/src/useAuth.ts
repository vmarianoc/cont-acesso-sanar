import { useState, useCallback } from 'react'
import { apiLogin, apiLogout, type LoginPayload } from './auth'

interface AuthState {
  token: string | null
  perfil: string | null
}

function getInitialState(): AuthState {
  return {
    token: localStorage.getItem('token'),
    perfil: localStorage.getItem('perfil'),
  }
}

export function useAuth() {
  const [auth, setAuth] = useState<AuthState>(getInitialState)

  const login = useCallback(async (payload: LoginPayload) => {
    const data = await apiLogin(payload)
    localStorage.setItem('token', data.token)
    localStorage.setItem('perfil', data.perfil)
    setAuth({ token: data.token, perfil: data.perfil })
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiLogout()
    } finally {
      localStorage.removeItem('token')
      localStorage.removeItem('perfil')
      setAuth({ token: null, perfil: null })
    }
  }, [])

  return { token: auth.token, perfil: auth.perfil, isAuthenticated: !!auth.token, login, logout }
}
