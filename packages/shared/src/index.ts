import { z } from 'zod'

export const LoginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  senha: z.string().min(6, 'Senha deve ter ao menos 6 caracteres'),
  tenant_id: z.string().uuid('tenant_id deve ser um UUID válido'),
})

export const PessoaSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().min(2),
  cpf: z.string().nullable(),
  rg: z.string().nullable(),
  foto_url: z.string().url().nullable(),
  tipo: z.enum(['morador', 'funcionario', 'visitante', 'prestador']),
  ativo: z.boolean(),
  criado_em: z.string().datetime(),
  atualizado_em: z.string().datetime(),
})

export const UnidadeSchema = z.object({
  id: z.string().uuid(),
  bloco_id: z.string().uuid(),
  numero: z.string(),
  andar: z.number().int().nullable(),
  ativa: z.boolean(),
})

export const VeiculoSchema = z.object({
  id: z.string().uuid(),
  pessoa_id: z.string().uuid(),
  placa: z.string().min(6).max(8),
  modelo: z.string().nullable(),
  cor: z.string().nullable(),
  ativo: z.boolean(),
})

export const AprovacaoSchema = z.object({
  id: z.string().uuid(),
  pessoa_id: z.string().uuid(),
  unidade_id: z.string().uuid(),
  tipo: z.string(),
  status: z.enum(['pendente', 'aprovado', 'rejeitado']),
  dados: z.record(z.unknown()),
  criado_em: z.string().datetime(),
  atualizado_em: z.string().datetime(),
})

export const EventoAcessoSchema = z.object({
  id: z.string().uuid(),
  dispositivo_id: z.string().uuid(),
  pessoa_id: z.string().uuid().nullable(),
  tipo: z.string(),
  resultado: z.enum(['liberado', 'negado', 'erro']),
  metodo: z.enum(['facial', 'qrcode', 'biometria', 'manual']),
  foto_url: z.string().url().nullable(),
  criado_em: z.string().datetime(),
})

export const VisitanteSchema = z.object({
  id: z.string().uuid(),
  nome: z.string().min(2),
  documento: z.string().nullable(),
  foto_url: z.string().url().nullable(),
  unidade_id: z.string().uuid(),
  pre_autorizado_por: z.string().uuid(),
  valido_de: z.string().datetime(),
  valido_ate: z.string().datetime(),
  usado: z.boolean(),
})

export const CreatePessoaSchema = PessoaSchema.omit({
  id: true,
  criado_em: true,
  atualizado_em: true,
})

export const CreateVeiculoSchema = VeiculoSchema.omit({ id: true }).partial({
  modelo: true,
  cor: true,
  ativo: true,
})

export const CreateAprovacaoSchema = AprovacaoSchema.omit({
  id: true,
  status: true,
  criado_em: true,
  atualizado_em: true,
})

export const PreAutorizarVisitanteSchema = VisitanteSchema.omit({
  id: true,
  pre_autorizado_por: true,
  usado: true,
}).partial({ documento: true, foto_url: true })

export type Login = z.infer<typeof LoginSchema>
export type Pessoa = z.infer<typeof PessoaSchema>
export type Unidade = z.infer<typeof UnidadeSchema>
export type Veiculo = z.infer<typeof VeiculoSchema>
export type Aprovacao = z.infer<typeof AprovacaoSchema>
export type EventoAcesso = z.infer<typeof EventoAcessoSchema>
export type Visitante = z.infer<typeof VisitanteSchema>
export type CreatePessoa = z.infer<typeof CreatePessoaSchema>
export type CreateVeiculo = z.infer<typeof CreateVeiculoSchema>
export type CreateAprovacao = z.infer<typeof CreateAprovacaoSchema>
export type PreAutorizarVisitante = z.infer<typeof PreAutorizarVisitanteSchema>
