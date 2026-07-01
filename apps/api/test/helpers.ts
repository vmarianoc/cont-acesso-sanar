import postgres from 'postgres'
import { v4 as uuidv4 } from 'uuid'
import { createTenant } from '../src/services/tenantService.js'
import { hashPassword } from '../src/services/authService.js'

export interface TestTenant {
  tenantId: string
  schemaName: string
  dispositivoId: string
  porteiro: { email: string; senha: string; pessoaId: string }
  sindico: { email: string; senha: string; pessoaId: string }
  morador: { email: string; senha: string; pessoaId: string }
  unidadeId: string
  aprovacaoId: string
  moradorNome: string
}

export function makeSql(): postgres.Sql {
  return postgres(process.env.DATABASE_URL!, { max: 4, onnotice: () => {} })
}

export async function createTestTenant(sql: postgres.Sql, label: string): Promise<TestTenant> {
  const tenant = await createTenant(sql, `Test ${label} ${uuidv4().slice(0, 8)}`, 'profissional')
  const moradorNome = `Morador ${label} ${uuidv4().slice(0, 6)}`

  const porteiroPessoa = uuidv4()
  const sindicoPessoa = uuidv4()
  const moradorPessoa = uuidv4()
  const dispositivoId = uuidv4()
  const condominioId = uuidv4()
  const blocoId = uuidv4()
  const unidadeId = uuidv4()
  const aprovacaoId = uuidv4()

  const senhaHash = await hashPassword('senha123')

  const reserved = await sql.reserve()
  try {
    await reserved.unsafe(`SET search_path TO ${tenant.schema_name}, public`)

    await reserved.unsafe(`INSERT INTO condominios (id, nome) VALUES ($1, $2)`, [
      condominioId,
      `Cond ${label}`,
    ])
    await reserved.unsafe(`INSERT INTO blocos (id, condominio_id, nome) VALUES ($1, $2, $3)`, [
      blocoId,
      condominioId,
      'Bloco A',
    ])
    await reserved.unsafe(`INSERT INTO unidades (id, bloco_id, numero) VALUES ($1, $2, $3)`, [
      unidadeId,
      blocoId,
      '101',
    ])
    await reserved.unsafe(
      `INSERT INTO dispositivos (id, nome, tipo, condominio_id) VALUES ($1, $2, $3, $4)`,
      [dispositivoId, 'Catraca', 'catraca', condominioId]
    )

    await reserved.unsafe(`INSERT INTO pessoas (id, nome, tipo) VALUES ($1, $2, 'funcionario')`, [
      porteiroPessoa,
      `Porteiro ${label}`,
    ])
    await reserved.unsafe(`INSERT INTO pessoas (id, nome, tipo) VALUES ($1, $2, 'funcionario')`, [
      sindicoPessoa,
      `Sindico ${label}`,
    ])
    await reserved.unsafe(`INSERT INTO pessoas (id, nome, tipo) VALUES ($1, $2, 'morador')`, [
      moradorPessoa,
      moradorNome,
    ])

    await reserved.unsafe(
      `INSERT INTO usuarios_tenant (id, pessoa_id, email, senha_hash, perfil)
       VALUES ($1, $2, $3, $4, 'porteiro')`,
      [uuidv4(), porteiroPessoa, `porteiro-${tenant.id}@test.com`, senhaHash]
    )
    await reserved.unsafe(
      `INSERT INTO usuarios_tenant (id, pessoa_id, email, senha_hash, perfil)
       VALUES ($1, $2, $3, $4, 'sindico')`,
      [uuidv4(), sindicoPessoa, `sindico-${tenant.id}@test.com`, senhaHash]
    )
    await reserved.unsafe(
      `INSERT INTO usuarios_tenant (id, pessoa_id, email, senha_hash, perfil)
       VALUES ($1, $2, $3, $4, 'morador')`,
      [uuidv4(), moradorPessoa, `morador-${tenant.id}@test.com`, senhaHash]
    )

    await reserved.unsafe(
      `INSERT INTO eventos (id, dispositivo_id, pessoa_id, tipo, resultado, metodo)
       VALUES ($1, $2, $3, 'entrada', 'liberado', 'facial')`,
      [uuidv4(), dispositivoId, moradorPessoa]
    )

    await reserved.unsafe(
      `INSERT INTO aprovacoes (id, pessoa_id, unidade_id, tipo, dados)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        aprovacaoId,
        moradorPessoa,
        unidadeId,
        'cadastro_veiculo',
        reserved.json({ placa: 'ABC1D23' }) as any,
      ] as any
    )
  } finally {
    reserved.release()
  }

  return {
    tenantId: tenant.id,
    schemaName: tenant.schema_name,
    dispositivoId,
    porteiro: { email: `porteiro-${tenant.id}@test.com`, senha: 'senha123', pessoaId: porteiroPessoa },
    sindico: { email: `sindico-${tenant.id}@test.com`, senha: 'senha123', pessoaId: sindicoPessoa },
    morador: { email: `morador-${tenant.id}@test.com`, senha: 'senha123', pessoaId: moradorPessoa },
    unidadeId,
    aprovacaoId,
    moradorNome,
  }
}

export async function dropTestTenant(sql: postgres.Sql, t: TestTenant): Promise<void> {
  await sql.unsafe(`DROP SCHEMA IF EXISTS ${t.schemaName} CASCADE`)
  await sql`DELETE FROM public.licencas WHERE tenant_id = ${t.tenantId}`
  await sql`DELETE FROM public.tenants WHERE id = ${t.tenantId}`
}
