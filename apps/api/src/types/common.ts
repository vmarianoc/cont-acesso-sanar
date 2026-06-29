export interface Tenant {
  id: string;
  nome: string;
  schema_name: string;
  plano: string;
  ativo: boolean;
  criado_em: Date;
}

export interface JwtPayload {
  sub: string;
  tenant_id: string;
  perfil: string;
  schema_name: string;
  iat?: number;
  exp?: number;
}

export interface Pessoa {
  id: string;
  nome: string;
  cpf: string | null;
  rg: string | null;
  foto_url: string | null;
  tipo: 'morador' | 'funcionario' | 'visitante' | 'prestador';
  ativo: boolean;
  criado_em: Date;
  atualizado_em: Date;
}

export interface Unidade {
  id: string;
  bloco_id: string;
  numero: string;
  andar: number | null;
  ativa: boolean;
}

export interface VinculoUnidade {
  id: string;
  pessoa_id: string;
  unidade_id: string;
  tipo_vinculo: 'proprietario' | 'inquilino' | 'dependente' | 'funcionario';
  ativo: boolean;
  inicio: Date;
  fim: Date | null;
}

export interface Veiculo {
  id: string;
  pessoa_id: string;
  placa: string;
  modelo: string | null;
  cor: string | null;
  ativo: boolean;
}

export interface Aprovacao {
  id: string;
  pessoa_id: string;
  unidade_id: string;
  tipo: string;
  status: 'pendente' | 'aprovado' | 'rejeitado';
  dados: Record<string, unknown>;
  criado_em: Date;
  atualizado_em: Date;
}

export interface EventoAcesso {
  id: string;
  dispositivo_id: string;
  pessoa_id: string | null;
  tipo: string;
  resultado: 'liberado' | 'negado' | 'erro';
  metodo: 'facial' | 'qrcode' | 'biometria' | 'manual';
  foto_url: string | null;
  criado_em: Date;
}

export interface Visitante {
  id: string;
  nome: string;
  documento: string | null;
  foto_url: string | null;
  unidade_id: string;
  pre_autorizado_por: string;
  valido_de: Date;
  valido_ate: Date;
  usado: boolean;
}

export interface ApiSuccess<T> {
  data: T;
}

export interface ApiError {
  erro: {
    codigo: string;
    mensagem: string;
  };
}
