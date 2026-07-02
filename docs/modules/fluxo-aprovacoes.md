# Fluxo de Aprovações

## Visão geral

O Fluxo de Aprovações é o mecanismo que garante que alterações sensíveis nos dados cadastrais do condomínio passem por revisão antes de serem aplicadas. É o coração do conceito de **Cadastro Vivo**: qualquer morador pode propor alterações, mas elas só valem após aprovação autorizada.

## Por que o fluxo de aprovações existe

Sem controle de aprovação, um morador mal-intencionado poderia:
- Cadastrar um veículo de outra pessoa em sua unidade
- Adicionar um "dependente" para ter mais acessos
- Alterar biometria para burlar o controle de acesso

O fluxo garante que cada alteração seja revisada por quem tem autoridade (síndico, administradora) e que haja rastreabilidade completa de quem aprovou o quê e quando.

## Tipos de solicitação

| Tipo | Quem solicita | Quem aprova | Prazo padrão |
|---|---|---|---|
| Titularidade da unidade | Novo morador | Síndico | 5 dias úteis |
| Cadastro de novo morador | Morador titular | Síndico | 48 horas |
| Atualização de dados pessoais (sensíveis) | Morador | Síndico | 48 horas |
| Cadastro de veículo | Morador | Síndico | 24 horas |
| Cadastro de funcionário doméstico | Morador | Síndico | 48 horas |
| Pré-autorização de visitante recorrente | Morador | Automático* | — |
| Importação em lote | Administradora | Síndico | 5 dias úteis |
| Bloqueio de acesso | Síndico | Automático | — |

*Pré-autorização de visitante recorrente pode ser configurada para aprovação automática ou manual.

## Estados de uma solicitação

```
          ┌──────────────┐
          │   CRIADA     │  morador envia solicitação
          └──────┬───────┘
                 │
          ┌──────▼───────┐
          │  PENDENTE    │  aguardando aprovação do síndico
          └──────┬───────┘
                 │
        ┌────────┼────────┐
        ▼        ▼        ▼
  ┌──────────┐ ┌────────┐ ┌──────────────────┐
  │ APROVADA │ │REPROVADA│ │ DOC. ADICIONAL   │
  └────┬─────┘ └────┬───┘ │ SOLICITADO       │
       │             │     └────────┬─────────┘
       ▼             ▼              │
  Aplicada no    Notifica     Morador envia
  cadastro       morador      documento e
  (Edge+Cloud)   (motivo)     volta a PENDENTE
```

## Configurações do fluxo (App Síndico)

### Nível de aprovação

Cada campo cadastral pode ser configurado com um nível:

| Nível | Comportamento |
|---|---|
| `auto` | Aprovado automaticamente, sem revisão |
| `simples` | Aprovado pelo síndico ou subsíndico |
| `duplo` | Requer aprovação de síndico E conselheiro |
| `admin` | Requer aprovação da administradora |

**Padrão por campo:**
- Nome, telefone, e-mail: `auto`
- CPF, RG, foto de perfil: `simples`
- Biometria, titularidade, funcionário doméstico: `simples` (ou `duplo` se configurado)
- Importação em lote: `admin`

### Ação ao vencer o prazo

Por tipo de solicitação, o síndico define o que acontece se ele não responder dentro do prazo:

- `reprovar_auto`: reprova automaticamente (padrão para dados sensíveis)
- `aprovar_auto`: aprova automaticamente (possível para baixo risco)
- `escalar`: encaminha para subsíndico ou administradora
- `nada`: permanece pendente até ação manual

### Notificações

- **Criação**: síndico recebe push imediato com resumo da solicitação
- **Lembrete**: se não respondida em 50% do prazo, envia lembrete
- **Vencimento**: notificação ao vencer o prazo, com ação automática executada
- **Resultado**: morador recebe push com aprovação ou reprovação + motivo

## Auditoria

Toda ação no fluxo é registrada na tabela `historico_aprovacoes`:

```sql
CREATE TABLE historico_aprovacoes (
  id              UUID PRIMARY KEY,
  solicitacao_id  UUID NOT NULL REFERENCES aprovacoes(id),
  acao            TEXT NOT NULL,  -- criada, aprovada, reprovada, etc.
  usuario_id      UUID NOT NULL,
  motivo          TEXT,
  dados_snapshot  JSONB,  -- snapshot dos dados no momento da ação
  criado_em       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

O `dados_snapshot` preserva o estado exato dos campos solicitados no momento da decisão, garantindo rastreabilidade mesmo que os dados mudem depois.

## Exemplo de fluxo completo

**Cenário**: morador da Apto 301 solicita cadastro de novo veículo.

```
1. Morador abre App → "Meus Veículos" → "+ Adicionar"
   Preenche: placa ABC-1234, Honda Civic 2022, preto

2. Sistema cria solicitação #4521 com status PENDENTE
   Envia push para síndico: "Carlos Lima (Apto 301) solicitou cadastro
   de veículo ABC-1234. Revisar?"

3. Síndico abre App Síndico → Central de Aprovações → #4521
   Vê: placa, modelo, foto do veículo (se enviada), histórico de Carlos

4. Síndico clica "Aprovar"
   Sistema registra em historico_aprovacoes (aprovada, usuário: síndico)
   Envia comando para Edge: adicionar ABC-1234 na lista de veículos autorizados
   Envia push para Carlos: "Veículo aprovado. Acesso liberado."

5. Edge recebe o comando (imediatamente se online, ou na próxima sync)
   Atualiza cadastro local
   Configura no hardware de reconhecimento de placa (se disponível)
```

## Documentação relacionada

- [App Síndico](sindico-app.md)
- [App Morador](morador-app.md)
- [Cadastro Inteligente](cadastro-inteligente.md)
- [LGPD e Segurança](../docs/02-lgpd-e-seguranca.md)
- [Identidade Condominial](../database/identidade-condominial.md)
