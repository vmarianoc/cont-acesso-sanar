import { randomBytes } from 'node:crypto'
import { v4 as uuidv4 } from 'uuid'
import type postgres from 'postgres'

type ReservedSql = Awaited<ReturnType<postgres.Sql['reserve']>>

export interface RamalSip {
  id: string
  pessoa_id: string
  numero: string
  usuario_sip: string
  senha_sip: string
  ativo: boolean
  criado_em: string
}

const NUMERO_INICIAL = 1000

function gerarSenhaSip(): string {
  // Credencial consumida uma única vez pelo app para registrar o softphone
  // no Flexisip do Edge (ver docs/modules/central-sip.md).
  //
  // LIMITAÇÃO CONHECIDA: guardada aqui em texto plano (necessário para
  // autenticação SIP digest, que não aceita hash irreversível como bcrypt).
  // Antes de produção, avaliar criptografia em repouso ou mover a posse da
  // credencial só para o Edge/Flexisip, com a Cloud guardando apenas uma
  // referência.
  return randomBytes(9).toString('base64url')
}

async function proximoNumero(db: ReservedSql): Promise<string> {
  const rows = await db.unsafe<{ proximo: number }[]>(
    `SELECT COALESCE(MAX(numero::int), $1) + 1 AS proximo FROM ramais_sip`,
    [NUMERO_INICIAL - 1]
  )
  return String(rows[0].proximo)
}

/** Retorna o ramal ativo da pessoa, se existir. */
export async function buscarRamalPorPessoa(db: ReservedSql, pessoaId: string): Promise<RamalSip | null> {
  const rows = await db.unsafe<RamalSip[]>(
    `SELECT * FROM ramais_sip WHERE pessoa_id = $1 AND ativo = true LIMIT 1`,
    [pessoaId]
  )
  return rows[0] ?? null
}

/**
 * Gera (ou retorna, se já existir) o ramal SIP de uma pessoa — idempotente.
 * Chamado ao criar o usuário de um morador (POST /usuarios), espelhando
 * "o ramal é criado automaticamente quando o morador é aprovado no cadastro"
 * (docs/modules/central-sip.md).
 */
export async function gerarRamal(db: ReservedSql, pessoaId: string): Promise<RamalSip> {
  const existente = await buscarRamalPorPessoa(db, pessoaId)
  if (existente) return existente

  for (let tentativa = 0; tentativa < 5; tentativa++) {
    const numero = await proximoNumero(db)
    const senha = gerarSenhaSip()
    try {
      const rows = await db.unsafe<RamalSip[]>(
        `INSERT INTO ramais_sip (id, pessoa_id, numero, usuario_sip, senha_sip)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [uuidv4(), pessoaId, numero, numero, senha]
      )
      return rows[0]
    } catch (err: any) {
      // Corrida entre requisições concorrentes gerando o mesmo número — retenta.
      if (err?.code === '23505') continue
      throw err
    }
  }
  throw new Error('Não foi possível gerar um número de ramal disponível')
}

/** Lista os ramais dos ocupantes ativos de uma unidade (sem a credencial). */
export async function listarRamaisPorUnidade(
  db: ReservedSql,
  unidadeId: string
): Promise<{ pessoa_id: string; pessoa_nome: string; numero: string }[]> {
  return db.unsafe(
    `SELECT r.pessoa_id, p.nome AS pessoa_nome, r.numero
     FROM ramais_sip r
     JOIN pessoas p ON p.id = r.pessoa_id
     JOIN vinculos_unidade v ON v.pessoa_id = r.pessoa_id AND v.ativo = true
     WHERE v.unidade_id = $1 AND r.ativo = true
     ORDER BY p.nome`,
    [unidadeId]
  )
}
