# Identidade Condominial

## Visão geral

O modelo de identidade define como pessoas, unidades e seus vínculos são representados no banco de dados. É o núcleo do **Cadastro Vivo**: uma estrutura que suporta múltiplos ocupantes por unidade, múltiplos vínculos de uma pessoa (ex.: proprietário de um apartamento e inquilino em outro), e rastreabilidade completa de todas as mudanças.

## Entidades principais

### `unidades`

Representa uma unidade habitacional ou comercial do condomínio.

```sql
CREATE TABLE unidades (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bloco_id     UUID NOT NULL REFERENCES blocos(id),
  numero       TEXT NOT NULL,           -- "201", "Loja 3", "Cobertura A"
  tipo         TEXT NOT NULL,           -- 'residencial' | 'comercial' | 'mista'
  area_m2      NUMERIC(8,2),
  vagas        INT NOT NULL DEFAULT 0,
  ativa        BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (bloco_id, numero)
);
```

### `pessoas`

Toda pessoa física que tem algum vínculo com o condomínio.

```sql
CREATE TABLE pessoas (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome            TEXT NOT NULL,
  cpf             TEXT,
  rg              TEXT,
  data_nascimento DATE,
  foto_url        TEXT,
  email           TEXT,
  telefone        TEXT,
  -- controle de versão / soft delete
  versao          INT NOT NULL DEFAULT 1,
  excluido_em     TIMESTAMPTZ,
  excluido_por    UUID,
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_pessoas_cpf ON pessoas(cpf) WHERE excluido_em IS NULL;
```

### `vinculos_unidade`

Relaciona pessoas a unidades com tipo e período de vigência. Uma unidade pode ter múltiplos vínculos ativos (ex.: proprietário + inquilino + cônjuge do inquilino).

```sql
CREATE TABLE vinculos_unidade (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  unidade_id   UUID NOT NULL REFERENCES unidades(id),
  pessoa_id    UUID NOT NULL REFERENCES pessoas(id),
  tipo         TEXT NOT NULL,  -- ver tabela abaixo
  principal    BOOLEAN NOT NULL DEFAULT FALSE,  -- responsável pela unidade
  inicio_em    DATE NOT NULL DEFAULT CURRENT_DATE,
  fim_em       DATE,           -- NULL = vigente
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  criado_por   UUID NOT NULL   -- quem fez o cadastro
);
```

**Tipos de vínculo:**

| Tipo | Descrição | Permissões de acesso |
|---|---|---|
| `proprietario` | Dono do imóvel | Integral, sem restrição de horário |
| `inquilino` | Locatário atual | Integral, sem restrição de horário |
| `conjuge` | Cônjuge ou companheiro | Integral |
| `dependente` | Filho, pai, parente | Integral |
| `funcionario_dom` | Diarista, babá, cuidador | Conforme agenda cadastrada |
| `prestador` | Prestador de serviço temporário | Conforme período autorizado |

### `veiculos`

```sql
CREATE TABLE veiculos (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id    UUID REFERENCES pessoas(id),
  unidade_id   UUID NOT NULL REFERENCES unidades(id),
  placa        TEXT NOT NULL,
  modelo       TEXT,
  cor          TEXT,
  vaga         TEXT,
  ativo        BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_veiculos_placa ON veiculos(placa) WHERE ativo = TRUE;
```

### `biometrias`

Armazena referência aos templates biométricos (os templates em si ficam no hardware).

```sql
CREATE TABLE biometrias (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id      UUID NOT NULL REFERENCES pessoas(id),
  tipo           TEXT NOT NULL,  -- 'facial' | 'digital' | 'cartao' | 'qr'
  referencia     TEXT NOT NULL,  -- ID interno no hardware ou hash do cartão
  hardware_id    UUID NOT NULL,  -- ponto de acesso onde está cadastrado
  consentido_em  TIMESTAMPTZ NOT NULL,  -- consentimento LGPD obrigatório
  ativo          BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Histórico de versões de cadastro

Cada atualização em `pessoas` cria uma cópia do estado anterior em `historico_pessoas`:

```sql
CREATE TABLE historico_pessoas (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id     UUID NOT NULL REFERENCES pessoas(id),
  versao        INT NOT NULL,
  snapshot      JSONB NOT NULL,  -- estado completo da pessoa nessa versão
  alterado_por  UUID NOT NULL,
  alterado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  motivo        TEXT
);
```

Isso permite responder: "como estava o cadastro do morador João em 15/03/2025?" — sem perda de dados.

## Regras de negócio críticas

**Uma unidade sempre tem exatamente um vínculo `principal` ativo.** Ao trocar o responsável (ex.: proprietário → inquilino), o sistema encerra o vínculo antigo (`fim_em = hoje`) e cria o novo com `principal = TRUE`. A operação é atômica (dentro de uma transação).

**CPF é único por condomínio para vínculos ativos.** A mesma pessoa pode existir em múltiplos condomínios (tenants diferentes), mas dentro do mesmo condomínio só pode ter um registro ativo.

**Exclusão física nunca ocorre imediatamente.** Toda exclusão define `excluido_em` e `excluido_por`. Queries normais filtram `WHERE excluido_em IS NULL`. A purga física ocorre após o prazo legal (ver [LGPD](../docs/02-lgpd-e-seguranca.md)).

## Consultas frequentes

```sql
-- Todos os ocupantes ativos de uma unidade
SELECT p.nome, vu.tipo, vu.principal
FROM vinculos_unidade vu
JOIN pessoas p ON p.id = vu.pessoa_id
WHERE vu.unidade_id = $1
  AND vu.fim_em IS NULL
  AND p.excluido_em IS NULL;

-- Unidades de uma pessoa (ex.: para o App Morador)
SELECT u.numero, b.nome as bloco, vu.tipo, vu.principal
FROM vinculos_unidade vu
JOIN unidades u ON u.id = vu.unidade_id
JOIN blocos b ON b.id = u.bloco_id
WHERE vu.pessoa_id = $1
  AND vu.fim_em IS NULL;

-- Veículos autorizados no condomínio (para reconhecimento de placa)
SELECT v.placa, v.modelo, v.cor, p.nome, u.numero as unidade
FROM veiculos v
JOIN unidades u ON u.id = v.unidade_id
JOIN pessoas p ON p.id = v.pessoa_id
WHERE v.ativo = TRUE
  AND p.excluido_em IS NULL;
```

## Documentação relacionada

- [Multi-tenant](multi-tenant.md)
- [Fluxo de Aprovações](../modules/fluxo-aprovacoes.md)
- [LGPD e Segurança](../docs/02-lgpd-e-seguranca.md)
- [Edge Sync](../edge/edge-sync.md)
