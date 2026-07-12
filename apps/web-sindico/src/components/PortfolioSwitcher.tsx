import { useState } from 'react'
import { trocarCondominio, type ContaCondominio } from '../api/sindico'

/**
 * Seletor de condomínio para quem administra mais de um (perfil
 * administradora): troca entre os tenants onde o mesmo e-mail tem conta
 * (lista salva no login via /auth/contas), sem redigitar a senha.
 */
export default function PortfolioSwitcher() {
  const [aberto, setAberto] = useState(false)

  const tenantAtual = localStorage.getItem('tenantId') ?? ''
  const condominioAtual = localStorage.getItem('condominio')
  const contas: ContaCondominio[] = JSON.parse(localStorage.getItem('contas') ?? '[]')
  const outrasContas = contas.filter((c) => c.tenant_id !== tenantAtual)

  if (outrasContas.length === 0) return null

  const escolherCondominio = async (tenantId: string) => {
    const r = await trocarCondominio(tenantId)
    localStorage.setItem('token', r.token)
    localStorage.setItem('tenantId', r.tenant_id)
    localStorage.setItem('condominio', r.condominio)
    window.location.href = '/'
  }

  return (
    <div className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1 rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold text-white"
      >
        {condominioAtual ?? 'Condomínio'} ▾
      </button>
      {aberto && (
        <div className="absolute right-0 z-50 mt-1 w-64 rounded-xl bg-white shadow-lg border border-gray-100 py-1">
          <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-gray-400">
            Meus condomínios
          </p>
          {outrasContas.map((c) => (
            <button
              key={c.tenant_id}
              onClick={() => escolherCondominio(c.tenant_id)}
              className="block w-full px-3 py-2 text-left text-sm text-gray-700"
            >
              ↪ {c.condominio}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
