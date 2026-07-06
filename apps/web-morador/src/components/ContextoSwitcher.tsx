import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchContextos, trocarCondominio, type ContaCondominio } from '../api/morador'

/**
 * Seletor de contexto do morador: alterna entre as unidades do usuário no
 * condomínio atual e entre os condomínios (tenants) onde o mesmo e-mail tem
 * conta (lista salva no login via /auth/contas).
 */
export default function ContextoSwitcher() {
  const qc = useQueryClient()
  const [aberto, setAberto] = useState(false)
  const { data: contextos } = useQuery({ queryKey: ['contextos'], queryFn: fetchContextos })

  const unidadeAtual = localStorage.getItem('unidadeId')
  const tenantAtual = localStorage.getItem('tenantId') ?? ''
  const contas: ContaCondominio[] = JSON.parse(localStorage.getItem('contas') ?? '[]')
  const outrasContas = contas.filter((c) => c.tenant_id !== tenantAtual)

  const atual =
    contextos?.find((c) => c.unidade_id === unidadeAtual) ??
    contextos?.find((c) => c.principal) ??
    contextos?.[0]

  if (!atual && outrasContas.length === 0) return null

  const escolherUnidade = (unidadeId: string) => {
    localStorage.setItem('unidadeId', unidadeId)
    setAberto(false)
    qc.invalidateQueries()
  }

  const escolherCondominio = async (tenantId: string) => {
    const r = await trocarCondominio(tenantId)
    localStorage.setItem('token', r.token)
    localStorage.setItem('tenantId', r.tenant_id)
    localStorage.removeItem('unidadeId')
    window.location.href = '/'
  }

  return (
    <div className="relative">
      <button
        onClick={() => setAberto((v) => !v)}
        className="flex items-center gap-1 rounded-xl bg-white/15 px-3 py-1.5 text-sm font-semibold text-white"
      >
        {atual ? `AP ${atual.unidade_numero}` : 'Conta'} ▾
      </button>
      {aberto && (
        <div className="absolute right-0 z-50 mt-1 w-64 rounded-xl bg-white shadow-lg border border-gray-100 py-1">
          {(contextos?.length ?? 0) > 0 && (
            <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-gray-400">Minhas unidades</p>
          )}
          {contextos?.map((c) => (
            <button
              key={c.unidade_id}
              onClick={() => escolherUnidade(c.unidade_id)}
              className={`block w-full px-3 py-2 text-left text-sm ${
                c.unidade_id === (atual?.unidade_id ?? '') ? 'font-bold text-brand-600' : 'text-gray-700'
              }`}
            >
              {c.condominio} · {c.bloco} · {c.unidade_numero}
            </button>
          ))}
          {outrasContas.length > 0 && (
            <>
              <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-widest text-gray-400 border-t border-gray-100">
                Outros condomínios
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
            </>
          )}
        </div>
      )}
    </div>
  )
}
