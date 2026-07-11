import 'dotenv/config'
import postgres from 'postgres'
import { v4 as uuidv4 } from 'uuid'
import { createTenant } from '../services/tenantService.js'
import { hashPassword } from '../services/authService.js'

const TENANT_NOME = 'Residencial Horizonte'

const USUARIOS = [
  { email: 'superadmin@demo.com', senha: 'super1234', perfil: 'superadmin', nome: 'Super Admin' },
  { email: 'sindico@demo.com', senha: 'sindico123', perfil: 'sindico', nome: 'Síndico Carlos Lima' },
  { email: 'porteiro@demo.com', senha: 'porteiro123', perfil: 'porteiro', nome: 'Porteiro João Souza' },
  { email: 'morador@demo.com', senha: 'morador123', perfil: 'morador', nome: 'Ana Pereira' },
  { email: 'morador2@demo.com', senha: 'morador123', perfil: 'morador', nome: 'Pedro Silva' },
] as const

async function run() {
  const sql = postgres(process.env.DATABASE_URL!, { max: 4, onnotice: () => {} })

  const existing = await sql<{ id: string; schema_name: string }[]>`
    SELECT id, schema_name FROM public.tenants WHERE nome = ${TENANT_NOME} LIMIT 1
  `

  if (existing[0]) {
    console.log(`Tenant "${TENANT_NOME}" já existe (${existing[0].id}). Seed idempotente: nada a fazer.`)
    printCredenciais(existing[0].id)
    await sql.end()
    return
  }

  const tenant = await createTenant(sql, TENANT_NOME, 'profissional')
  console.log(`Tenant criado: ${tenant.id} (${tenant.schema_name})`)

  const reserved = await sql.reserve()
  try {
    await reserved.unsafe(`SET search_path TO ${tenant.schema_name}, public`)

    const condominioId = uuidv4()
    await reserved.unsafe(
      `INSERT INTO condominios (id, nome, cnpj, cidade, estado)
       VALUES ($1, $2, $3, $4, $5)`,
      [condominioId, TENANT_NOME, '12.345.678/0001-90', 'São Paulo', 'SP']
    )

    const blocoId = uuidv4()
    await reserved.unsafe(`INSERT INTO blocos (id, condominio_id, nome) VALUES ($1, $2, $3)`, [
      blocoId,
      condominioId,
      'Bloco A',
    ])

    const unidadeIds: string[] = []
    for (const numero of ['101', '102', '201']) {
      const uid = uuidv4()
      unidadeIds.push(uid)
      await reserved.unsafe(
        `INSERT INTO unidades (id, bloco_id, numero, andar) VALUES ($1, $2, $3, $4)`,
        [uid, blocoId, numero, parseInt(numero[0], 10)]
      )
    }

    const dispositivoId = uuidv4()
    await reserved.unsafe(
      `INSERT INTO dispositivos (id, nome, tipo, local, condominio_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [dispositivoId, 'Catraca Entrada Principal', 'catraca', 'Entrada Principal', condominioId]
    )

    const pessoaIds: Record<string, string> = {}
    for (const u of USUARIOS) {
      let pessoaId: string | null = null
      if (u.perfil !== 'superadmin') {
        pessoaId = uuidv4()
        pessoaIds[u.email] = pessoaId
        await reserved.unsafe(
          `INSERT INTO pessoas (id, nome, tipo) VALUES ($1, $2, $3)`,
          [pessoaId, u.nome, u.perfil === 'morador' ? 'morador' : 'funcionario']
        )
      }
      await reserved.unsafe(
        `INSERT INTO usuarios_tenant (id, pessoa_id, email, senha_hash, perfil)
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), pessoaId, u.email, await hashPassword(u.senha), u.perfil]
      )
    }

    // vínculos: moradores nas unidades
    await reserved.unsafe(
      `INSERT INTO vinculos_unidade (id, pessoa_id, unidade_id, tipo_vinculo)
       VALUES ($1, $2, $3, 'proprietario'), ($4, $5, $6, 'inquilino')`,
      [
        uuidv4(), pessoaIds['morador@demo.com'], unidadeIds[0],
        uuidv4(), pessoaIds['morador2@demo.com'], unidadeIds[1],
      ]
    )

    // eventos de exemplo
    const moradores = [pessoaIds['morador@demo.com'], pessoaIds['morador2@demo.com']]
    const resultados = ['liberado', 'liberado', 'liberado', 'negado', 'liberado'] as const
    const metodos = ['facial', 'biometria', 'qrcode', 'facial', 'manual'] as const
    for (let i = 0; i < 10; i++) {
      await reserved.unsafe(
        `INSERT INTO eventos (id, dispositivo_id, pessoa_id, tipo, resultado, metodo, criado_em)
         VALUES ($1, $2, $3, $4, $5, $6, NOW() - ($7 || ' minutes')::interval)`,
        [
          uuidv4(),
          dispositivoId,
          moradores[i % 2],
          i % 3 === 0 ? 'saida' : 'entrada',
          resultados[i % resultados.length],
          metodos[i % metodos.length],
          String(i * 7),
        ]
      )
    }

    // aprovação pendente de exemplo (cadastro de veículo)
    await reserved.unsafe(
      `INSERT INTO aprovacoes (id, pessoa_id, unidade_id, tipo, dados)
       VALUES ($1, $2, $3, $4, $5)`,
      [
        uuidv4(),
        pessoaIds['morador@demo.com'],
        unidadeIds[0],
        'cadastro_veiculo',
        reserved.json({ placa: 'ABC1D23', modelo: 'Honda Civic', cor: 'preto' }),
      ] as any
    )

    // --- Módulos do app do morador (condar) ---
    const moradorPessoa = pessoaIds['morador@demo.com']

    const espacoIds: Record<string, string> = {}
    for (const nome of ['Salão de festas', 'Churrasqueira', 'Salão de jogos']) {
      const eid = uuidv4()
      espacoIds[nome] = eid
      const area = nome.toLowerCase().replace(/\s+/g, '_')
      await reserved.unsafe(`INSERT INTO espacos (id, nome, area) VALUES ($1, $2, $3)`, [eid, nome, area])
      // Cada área comum tem seu leitor facial próprio, validado por /edge/validate-access.
      await reserved.unsafe(
        `INSERT INTO dispositivos (id, nome, tipo, local, condominio_id, area)
         VALUES ($1, $2, 'leitor_facial', $3, $4, $5)`,
        [uuidv4(), `Leitor Facial — ${nome}`, nome, condominioId, area]
      )
    }
    await reserved.unsafe(
      `INSERT INTO reservas (id, espaco_id, pessoa_id, data, periodo, status)
       VALUES ($1, $2, $3, CURRENT_DATE + 5, '19h–22h', 'confirmada')`,
      [uuidv4(), espacoIds['Salão de jogos'], moradorPessoa]
    )

    await reserved.unsafe(
      `INSERT INTO encomendas (id, pessoa_id, unidade_id, remetente, descricao, prateleira, codigo_retirada, status)
       VALUES ($1, $2, $3, 'Mercado Livre', 'caixa média', 'B3', '4729', 'aguardando')`,
      [uuidv4(), moradorPessoa, unidadeIds[0]]
    )
    await reserved.unsafe(
      `INSERT INTO encomendas (id, pessoa_id, unidade_id, remetente, descricao, prateleira, status)
       VALUES ($1, $2, $3, 'Correios', 'caixa pequena', 'A1', 'aguardando')`,
      [uuidv4(), moradorPessoa, unidadeIds[0]]
    )
    await reserved.unsafe(
      `INSERT INTO encomendas (id, pessoa_id, unidade_id, remetente, status, retirada_em)
       VALUES ($1, $2, $3, 'Amazon', 'retirada', NOW() - INTERVAL '3 days')`,
      [uuidv4(), moradorPessoa, unidadeIds[0]]
    )

    await reserved.unsafe(
      `INSERT INTO solicitacoes_acesso (id, nome, documento, tipo, unidade_id, status)
       VALUES ($1, 'João Souza', '123.456.789-00', 'visita', $2, 'pendente')`,
      [uuidv4(), unidadeIds[0]]
    )
  } finally {
    reserved.release()
  }

  console.log('Dados de exemplo inseridos.')
  printCredenciais(tenant.id)
  await sql.end()
}

function printCredenciais(tenantId: string) {
  console.log('\n─── Credenciais de acesso ───')
  console.log(`tenant_id: ${tenantId}`)
  for (const u of USUARIOS) {
    console.log(`  ${u.perfil.padEnd(10)} ${u.email.padEnd(22)} senha: ${u.senha}`)
  }
  console.log('─────────────────────────────\n')
}

run().catch((err) => {
  console.error('Seed failed:', err)
  process.exit(1)
})
