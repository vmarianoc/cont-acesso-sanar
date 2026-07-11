import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { AppScreen, Header, Badge, IconTile } from '@condar/ui'
import {
  fetchComunicados,
  confirmarLeitura,
  fetchDocumentos,
  baixarDocumento,
} from '../api/morador'
import BottomNav from '../components/BottomNav'

const fmt = (s: string) =>
  new Date(s).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })

export default function AvisosPage() {
  const qc = useQueryClient()
  const { data: comunicados } = useQuery({ queryKey: ['comunicados'], queryFn: fetchComunicados })
  const { data: documentos } = useQuery({ queryKey: ['documentos'], queryFn: fetchDocumentos })

  const marcarLida = useMutation({
    mutationFn: confirmarLeitura,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['comunicados'] }),
  })

  const naoLidos = comunicados?.filter((c) => !c.lido).length ?? 0

  const baixar = async (id: string, nome: string) => {
    const blob = await baixarDocumento(id)
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nome
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <AppScreen bottomNav>
      <Header
        variant="tinta"
        eyebrow="Mural do condomínio"
        title={naoLidos > 0 ? `${naoLidos} aviso(s) não lido(s)` : 'Avisos'}
      />

      <div className="px-5 mt-4 space-y-3">
        {comunicados?.map((c) => (
          <div key={c.id} className={`bg-white rounded-2xl p-4 shadow-sm ${c.lido ? 'opacity-80' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <p className="font-semibold text-gray-900">{c.titulo}</p>
              {c.prioridade === 'urgente' ? (
                <Badge tone="red">urgente</Badge>
              ) : !c.lido ? (
                <Badge tone="green">novo</Badge>
              ) : null}
            </div>
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">{c.corpo}</p>
            <div className="flex items-center justify-between mt-3 text-xs text-gray-400">
              <span>{fmt(c.criado_em)}</span>
              {!c.lido && (
                <button
                  onClick={() => marcarLida.mutate(c.id)}
                  disabled={marcarLida.isPending}
                  className="text-brand-600 font-semibold disabled:opacity-50"
                >
                  Marcar como lido
                </button>
              )}
            </div>
          </div>
        ))}
        {comunicados?.length === 0 && (
          <div className="bg-white rounded-2xl p-8 text-center text-gray-500 shadow-sm">
            Nenhum aviso por enquanto.
          </div>
        )}

        {documentos && documentos.length > 0 && (
          <>
            <h3 className="text-xs tracking-widest uppercase text-gray-400 mt-4 px-1">Documentos</h3>
            {documentos.map((d) => (
              <button
                key={d.id}
                onClick={() => baixar(d.id, d.arquivo_nome)}
                className="w-full bg-white rounded-2xl p-4 shadow-sm flex items-center gap-3 text-left active:opacity-80"
              >
                <IconTile icon="📄" />
                <span className="flex-1 min-w-0">
                  <span className="block font-semibold text-gray-900 truncate">{d.titulo}</span>
                  <span className="block text-xs text-gray-500">
                    {fmt(d.criado_em)}
                    {d.escopo === 'grupo' && d.grupo_nome ? ` · ${d.grupo_nome}` : ''}
                  </span>
                </span>
                <span className="text-brand-600 text-sm font-semibold">Baixar</span>
              </button>
            ))}
          </>
        )}
      </div>

      <BottomNav />
    </AppScreen>
  )
}
