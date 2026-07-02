import { v4 as uuidv4 } from 'uuid'
import type postgres from 'postgres'
import { registrarAuditoria } from './auditoriaService.js'

type ReservedSql = Awaited<ReturnType<postgres.Sql['reserve']>>
type TipoVinculo = 'proprietario' | 'inquilino' | 'dependente' | 'funcionario'

export interface OcupanteParseado {
  tipo: string
  nome: string
  telefone: string
  cpf: string
  email: string
  endereco: string
}

export interface UnidadeParseada {
  codigo: string
  fracao: string
  ocupantes: OcupanteParseado[]
}

export interface RelatorioParseado {
  condominioNome: string | null
  unidades: UnidadeParseada[]
}

const PHONE = /^[+(]?\s*\d[\d\s()+\-]{6,}$/
const isFooter = (s: string) =>
  /Rua Poliateama N 111|Feira de Santana \/ BA|^\d+ de \d+$/.test(s)

function colOf(x: number): keyof OcupanteParseado | 'unidade' | 'fracao' {
  if (x < 90) return 'unidade' as any
  if (x < 240) return 'nome'
  if (x < 345) return 'tipo'
  if (x < 533) return 'endereco'
  if (x < 608) return 'cpf'
  if (x < 786) return 'email'
  return 'fracao' as any
}

/** Extrai a estrutura do relatório "Contatos das unidades" a partir do PDF. */
export async function parsePdf(buffer: Buffer): Promise<RelatorioParseado> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const data = new Uint8Array(buffer)
  const doc = await getDocument({ data, useSystemFonts: true }).promise

  let condominioNome: string | null = null
  const unidades = new Map<string, UnidadeParseada>()
  let curUnidade: string | null = null
  let curRec: OcupanteParseado | null = null

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const tc = await page.getTextContent()
    const items = tc.items
      .map((i: any) => ({ x: i.transform[4] as number, y: i.transform[5] as number, s: String(i.str).trim() }))
      .filter((i) => i.s)
    items.sort((a, b) => b.y - a.y || a.x - b.x)

    const lines: (typeof items)[] = []
    let cur: typeof items | null = null
    let lastY: number | null = null
    for (const it of items) {
      if (lastY === null || Math.abs(it.y - lastY) > 3.5) {
        cur = []
        lines.push(cur)
        lastY = it.y
      }
      cur!.push(it)
    }

    for (const line of lines) {
      const cells: Record<string, string> = {}
      for (const it of line) {
        const c = colOf(it.x)
        cells[c] = (cells[c] ? cells[c] + ' ' : '') + it.s
      }
      const joined = line.map((i) => i.s).join(' ')

      if (p === 1 && condominioNome === null && /^W\S+\s+.*Parque|^W\d/.test(joined) && /\(\d+\)/.test(joined)) {
        condominioNome = joined.replace(/^W\S+\s*/, '').replace(/\s*\(\d+\)\s*$/, '').trim() || null
      }
      if (isFooter(joined)) continue
      if (cells.unidade === 'Unidade' || cells.tipo === 'Tipo') continue

      if (cells.unidade && /^\d/.test(cells.unidade)) curUnidade = cells.unidade.trim()

      if (cells.tipo) {
        curRec = {
          tipo: cells.tipo.trim(),
          nome: cells.nome ? cells.nome.trim() : '',
          telefone: '',
          cpf: (cells.cpf ?? '').trim(),
          email: (cells.email ?? '').trim(),
          endereco: (cells.endereco ?? '').trim(),
        }
        if (PHONE.test(curRec.nome)) {
          curRec.telefone = curRec.nome
          curRec.nome = ''
        }
        pullFracaoFromEmail(curRec)
        if (curUnidade) {
          if (!unidades.has(curUnidade)) {
            unidades.set(curUnidade, { codigo: curUnidade, fracao: (cells.fracao ?? '').trim(), ocupantes: [] })
          }
          unidades.get(curUnidade)!.ocupantes.push(curRec)
        }
      } else if (curRec) {
        if (cells.nome) {
          const t = cells.nome.trim()
          if (PHONE.test(t) && !curRec.telefone) curRec.telefone = t
          else curRec.nome = (curRec.nome + ' ' + t).trim()
        }
        if (cells.email) {
          curRec.email = (curRec.email + cells.email).trim()
          pullFracaoFromEmail(curRec)
        }
        if (cells.cpf && !curRec.cpf) curRec.cpf = cells.cpf.trim()
        if (cells.endereco) curRec.endereco = (curRec.endereco + ' ' + cells.endereco).trim()
      }
    }
  }

  return { condominioNome, unidades: [...unidades.values()] }
}

/** A fração às vezes cai na coluna de e-mail (valor decimal à direita). */
function pullFracaoFromEmail(rec: OcupanteParseado) {
  const m = rec.email.match(/\s+(\d+(?:,\d+)?)\s*$/)
  if (m) rec.email = rec.email.slice(0, m.index).trim()
}

export function mapTipoVinculo(tipoRelatorio: string): { tipo: TipoVinculo; principal: boolean } {
  const t = tipoRelatorio.toLowerCase()
  if (t.includes('propriet')) return { tipo: 'proprietario', principal: true }
  if (t.includes('inquilin') || t.includes('locat')) return { tipo: 'inquilino', principal: false }
  if (t.includes('residente')) return { tipo: 'inquilino', principal: false }
  return { tipo: 'dependente', principal: false }
}

function soDigitos(s: string): string | null {
  const d = s.replace(/\D/g, '')
  return d.length >= 11 ? d : null
}

function limparNome(nome: string): string {
  return nome.replace(/^MRV n[ãa]o entregou as chaves-?\s*/i, '').replace(/\s+/g, ' ').trim()
}

export interface PlanoOcupante {
  nome: string
  cpf: string | null
  email: string | null
  telefone: string | null
  tipo_vinculo: TipoVinculo
  principal: boolean
}
export interface PlanoUnidade {
  numero: string
  andar: number | null
  ocupantes: PlanoOcupante[]
}
export interface PlanoImportacao {
  condominioNome: string
  bloco: string
  unidades: PlanoUnidade[]
  totais: { unidades: number; ocupantes: number; comCpf: number }
}

/** Transforma o relatório parseado em um plano de importação (função pura, testável). */
export function mapRelatorioParaPlano(
  rel: RelatorioParseado,
  opts: { condominioNome?: string; bloco?: string } = {}
): PlanoImportacao {
  const condominioNome = opts.condominioNome ?? rel.condominioNome ?? 'Condomínio Importado'
  const bloco = opts.bloco ?? 'Bloco Principal'

  const unidades: PlanoUnidade[] = []
  let ocupantesTotal = 0
  let comCpf = 0

  for (const u of rel.unidades) {
    const primeiroToken = u.codigo.trim().split(/\s+/)[0]
    const andar =
      /^\d{3}$/.test(primeiroToken) && Number(primeiroToken) >= 100
        ? Math.floor(Number(primeiroToken) / 100)
        : null

    const ocupantes: PlanoOcupante[] = []
    for (const o of u.ocupantes) {
      const nome = limparNome(o.nome)
      if (!nome) continue
      const { tipo, principal } = mapTipoVinculo(o.tipo)
      const cpf = soDigitos(o.cpf)
      if (cpf) comCpf++
      const email = (o.email.split(/[;\s]+/).find((e) => e.includes('@')) ?? '').trim() || null
      ocupantes.push({
        nome,
        cpf,
        email,
        telefone: o.telefone.trim() || null,
        tipo_vinculo: tipo,
        principal,
      })
    }
    // Garante no máximo um principal ativo por unidade.
    let principalVisto = false
    for (const o of ocupantes) {
      if (o.principal && !principalVisto) principalVisto = true
      else o.principal = false
    }
    ocupantesTotal += ocupantes.length
    unidades.push({ numero: u.codigo.trim(), andar, ocupantes })
  }

  return {
    condominioNome,
    bloco,
    unidades,
    totais: { unidades: unidades.length, ocupantes: ocupantesTotal, comCpf },
  }
}

export interface ResultadoImportacao {
  condominio_id: string
  bloco_id: string
  unidades_criadas: number
  unidades_existentes: number
  pessoas_criadas: number
  vinculos_criados: number
}

/** Aplica o plano ao schema do tenant (idempotente por nome/numero), transacional. */
export async function aplicarImportacao(
  db: ReservedSql,
  plano: PlanoImportacao,
  ctx: { usuarioId: string; ip?: string }
): Promise<ResultadoImportacao> {
  const res: ResultadoImportacao = {
    condominio_id: '',
    bloco_id: '',
    unidades_criadas: 0,
    unidades_existentes: 0,
    pessoas_criadas: 0,
    vinculos_criados: 0,
  }

  await db.unsafe('BEGIN')
  try {
    const condExist = await db.unsafe<{ id: string }[]>(
      `SELECT id FROM condominios WHERE nome = $1 LIMIT 1`,
      [plano.condominioNome]
    )
    let condominioId = condExist[0]?.id
    if (!condominioId) {
      condominioId = uuidv4()
      await db.unsafe(`INSERT INTO condominios (id, nome) VALUES ($1, $2)`, [
        condominioId,
        plano.condominioNome,
      ])
    }
    res.condominio_id = condominioId

    const blocoExist = await db.unsafe<{ id: string }[]>(
      `SELECT id FROM blocos WHERE condominio_id = $1 AND nome = $2 LIMIT 1`,
      [condominioId, plano.bloco]
    )
    let blocoId = blocoExist[0]?.id
    if (!blocoId) {
      blocoId = uuidv4()
      await db.unsafe(`INSERT INTO blocos (id, condominio_id, nome) VALUES ($1, $2, $3)`, [
        blocoId,
        condominioId,
        plano.bloco,
      ])
    }
    res.bloco_id = blocoId

    for (const u of plano.unidades) {
      const uExist = await db.unsafe<{ id: string }[]>(
        `SELECT id FROM unidades WHERE bloco_id = $1 AND numero = $2 LIMIT 1`,
        [blocoId, u.numero]
      )
      let unidadeId = uExist[0]?.id
      if (unidadeId) {
        res.unidades_existentes++
      } else {
        unidadeId = uuidv4()
        await db.unsafe(
          `INSERT INTO unidades (id, bloco_id, numero, andar) VALUES ($1, $2, $3, $4)`,
          [unidadeId, blocoId, u.numero, u.andar]
        )
        res.unidades_criadas++
      }

      for (const o of u.ocupantes) {
        let pessoaId: string | null = null
        let vinculoJaExiste = false

        if (o.cpf) {
          const pExist = await db.unsafe<{ id: string }[]>(
            `SELECT id FROM pessoas WHERE cpf = $1 LIMIT 1`,
            [o.cpf]
          )
          pessoaId = pExist[0]?.id ?? null
        } else {
          // Sem CPF: deduplica por vínculo ativo com pessoa de mesmo nome na unidade.
          const vByName = await db.unsafe<{ pessoa_id: string }[]>(
            `SELECT v.pessoa_id FROM vinculos_unidade v
             JOIN pessoas p ON p.id = v.pessoa_id
             WHERE v.unidade_id = $1 AND v.ativo = true AND lower(p.nome) = lower($2)
             LIMIT 1`,
            [unidadeId, o.nome]
          )
          if (vByName[0]) {
            pessoaId = vByName[0].pessoa_id
            vinculoJaExiste = true
          }
        }

        if (!pessoaId) {
          pessoaId = uuidv4()
          await db.unsafe(
            `INSERT INTO pessoas (id, nome, cpf, tipo, email, telefone) VALUES ($1, $2, $3, 'morador', $4, $5)`,
            [pessoaId, o.nome, o.cpf, o.email, o.telefone]
          )
          res.pessoas_criadas++
        }

        if (!vinculoJaExiste) {
          const vExist = await db.unsafe<{ id: string }[]>(
            `SELECT id FROM vinculos_unidade WHERE unidade_id = $1 AND pessoa_id = $2 AND ativo = true LIMIT 1`,
            [unidadeId, pessoaId]
          )
          vinculoJaExiste = vExist.length > 0
        }

        if (!vinculoJaExiste) {
          if (o.principal) {
            await db.unsafe(
              `UPDATE vinculos_unidade SET principal = false WHERE unidade_id = $1 AND principal = true AND ativo = true`,
              [unidadeId]
            )
          }
          await db.unsafe(
            `INSERT INTO vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo, principal, criado_por)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [uuidv4(), pessoaId, unidadeId, o.tipo_vinculo, o.principal, ctx.usuarioId]
          )
          res.vinculos_criados++
        }
      }
    }

    await registrarAuditoria(db, {
      usuario_id: ctx.usuarioId,
      acao: 'IMPORT',
      tabela: 'unidades',
      registro_id: condominioId,
      dados_depois: { ...plano.totais, resultado: res },
      ip: ctx.ip,
    })

    await db.unsafe('COMMIT')
  } catch (err) {
    await db.unsafe('ROLLBACK')
    throw err
  }

  return res
}
