# LGPD e Segurança

## Princípios gerais

A plataforma foi projetada com **privacy by design**: a coleta de dados pessoais é mínima, justificada e rastreável. Todos os dados de moradores, visitantes e funcionários são tratados conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018).

## Dados pessoais coletados

| Categoria | Dados | Base legal (LGPD, art. 7º) |
|---|---|---|
| Moradores | Nome, CPF, RG, foto, biometria facial/digital | Execução de contrato (inciso V) |
| Visitantes | Nome, documento, foto, placa | Legítimo interesse do condomínio (inciso IX) |
| Funcionários da portaria | Nome, CPF, biometria | Contrato de trabalho (inciso V) |
| Veículos | Placa, modelo, cor | Legítimo interesse (inciso IX) |
| Logs de acesso | Data/hora, pessoa, ponto de acesso | Obrigação legal de segurança (inciso II) |

Dados biométricos (impressão digital, face) são classificados como **dados sensíveis** (art. 11) e requerem consentimento explícito do titular.

## Auditoria e rastreabilidade

### Log de auditoria imutável

Toda operação de criação, alteração ou exclusão de dados pessoais gera um registro na tabela `auditoria`:

```sql
CREATE TABLE auditoria (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID NOT NULL,
  tabela      TEXT NOT NULL,
  registro_id UUID NOT NULL,
  operacao    TEXT NOT NULL,  -- INSERT, UPDATE, DELETE
  campo       TEXT,
  valor_antes JSONB,
  valor_depois JSONB,
  usuario_id  UUID NOT NULL,
  ip_origem   INET,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

A tabela `auditoria` é **append-only**: nenhuma linha pode ser atualizada ou excluída, mesmo por administradores. Isso é garantido por política de RLS (Row Level Security) no PostgreSQL.

### Versionamento de cadastro

Cada alteração em `pessoas`, `veiculos` e `unidades` cria uma nova versão em `historico_cadastro`, preservando o estado anterior. O síndico e a administradora podem consultar o histórico completo de qualquer registro.

## Soft delete

Nenhum dado pessoal é removido fisicamente do banco de dados de forma imediata. A exclusão lógica funciona assim:

1. O campo `excluido_em` é preenchido com a data da exclusão
2. O campo `excluido_por` registra o usuário responsável
3. Dados excluídos não aparecem em consultas normais (filtro padrão `WHERE excluido_em IS NULL`)
4. Após **5 anos** (prazo legal para registros de segurança), um job de purga remove fisicamente os dados, salvo obrigação legal de retenção maior

## Direitos dos titulares (LGPD, art. 18)

| Direito | Como exercer | Prazo de resposta |
|---|---|---|
| Confirmação e acesso | Exportar meus dados no App Morador | Imediato |
| Correção | Solicitar atualização cadastral no App | Até 48h após aprovação |
| Anonimização / exclusão | Solicitação formal via administradora | Até 15 dias úteis |
| Portabilidade | Exportação em JSON ou CSV | Até 15 dias úteis |
| Revogação de consentimento | Retirar biometria no App | Imediato (biometria apagada do hardware) |

## Segurança da informação

### Autenticação

- **Usuários humanos**: JWT com expiração de 15 minutos + refresh token de 30 dias (rotativo)
- **Edge Service**: certificado mTLS por tenant + token de API rotacionado a cada 90 dias
- **MFA**: obrigatório para perfis de Administrador e Síndico (TOTP via app autenticador)

### Criptografia

| Dado | Em repouso | Em trânsito |
|---|---|---|
| Banco Cloud | AES-256 (encryption at rest no PostgreSQL) | TLS 1.3 |
| Banco Edge | SQLite com SQLCipher (AES-256) | — |
| Biometria no hardware | Criptografada pelo SDK do fabricante | — |
| Comunicação Edge↔Cloud | — | TLS 1.3 com certificado mTLS |
| Tokens JWT | HS256 / RS256 | — |

### Controle de acesso (RBAC)

| Perfil | Permissões |
|---|---|
| Porteiro | Visualizar cadastros, liberar visitantes, registrar eventos |
| Morador | Ver e editar os próprios dados, solicitar acesso a visitantes |
| Síndico | Aprovar alterações, ver relatórios, configurar o condomínio |
| Administrador (administradora) | Gestão multi-tenant, planos, usuários |
| Super Admin (plataforma) | Acesso total para suporte e manutenção |

### Pentest e vulnerabilidades

- Testes de penetração externos realizados anualmente
- Programa de divulgação responsável de vulnerabilidades (security@plataforma.com.br)
- Dependências verificadas via Dependabot / OWASP Dependency-Check no CI/CD

## Incidentes de segurança

Em caso de violação de dados:

1. Notificação interna à equipe de segurança em até **2 horas**
2. Avaliação de impacto e escopo em até **24 horas**
3. Notificação à ANPD em até **72 horas** (art. 48, LGPD)
4. Notificação aos titulares afetados quando houver risco relevante

## Documentação relacionada

- [Visão Geral](00-visao-geral.md)
- [Identidade Condominial](../database/identidade-condominial.md)
- [Fluxo de Aprovações](../modules/fluxo-aprovacoes.md)
