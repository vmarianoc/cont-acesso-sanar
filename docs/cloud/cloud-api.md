# Cloud API

## Visão geral

A Cloud API é o backend central da plataforma, responsável por autenticação, gestão de tenants, sincronização com os Edges e por servir os apps móveis (Morador e Síndico). É uma API REST + WebSocket construída em **Node.js / Fastify**, hospedada em Docker/Kubernetes.

## Base URL

```
https://api.accessplatform.com.br/v1
```

Ambientes:
- Produção: `api.accessplatform.com.br`
- Staging: `api.staging.accessplatform.com.br`
- Local (dev): `localhost:3000`

## Autenticação

### Usuários humanos (app móvel / web)

```http
POST /auth/login
Content-Type: application/json

{
  "email": "sindico@condominio.com",
  "password": "...",
  "mfa_code": "123456"   // obrigatório para perfis Admin e Síndico
}
```

Resposta:
```json
{
  "access_token": "eyJ...",     // JWT, expira em 15 minutos
  "refresh_token": "...",       // expira em 30 dias, rotativo
  "tenant_id": "uuid",
  "perfil": "sindico"
}
```

### Edge Service (mTLS + API token)

O Edge se autentica com certificado mTLS no endpoint `/edge/*` e um `X-Edge-Token` rotacionado a cada 90 dias. O token é obtido com:

```http
POST /edge/auth
X-Edge-Token: <current-token>

{ "edge_id": "uuid", "fingerprint": "sha256:..." }
```

## Principais grupos de endpoints

### Auth

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/auth/login` | Login com e-mail/senha + MFA |
| POST | `/auth/refresh` | Renovar access_token com refresh_token |
| POST | `/auth/logout` | Invalidar refresh_token |
| POST | `/auth/forgot-password` | Enviar e-mail de recuperação de senha |

### Tenants e licenças

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/admin/tenants` | Listar tenants (perfil Super Admin) |
| POST | `/admin/tenants` | Criar novo tenant |
| GET | `/admin/tenants/:id/status` | Status, licença e Edge do tenant |
| POST | `/admin/tenants/:id/suspend` | Suspender tenant |
| GET | `/licenca` | Consultar licença do tenant atual |
| POST | `/edge/validate-license` | Validação de licença pelo Edge |

### Condomínio (síndico / administradora)

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/condominio` | Dados do condomínio atual |
| GET | `/unidades` | Listar unidades |
| POST | `/unidades` | Criar unidade |
| GET | `/pessoas` | Listar moradores |
| POST | `/aprovacoes` | Criar solicitação de aprovação |
| GET | `/aprovacoes` | Listar aprovações pendentes |
| PATCH | `/aprovacoes/:id` | Aprovar ou reprovar |

### App Morador

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/morador/perfil` | Dados do morador autenticado |
| PATCH | `/morador/perfil` | Solicitar atualização de dados |
| GET | `/morador/visitantes` | Histórico de visitantes |
| POST | `/morador/visitantes/pre-autorizar` | Pré-autorizar visitante |
| GET | `/morador/veiculos` | Veículos cadastrados |
| POST | `/morador/veiculos` | Solicitar cadastro de veículo |

### Sync (Edge → Cloud)

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/edge/sync/eventos` | Enviar eventos de acesso em lote |
| POST | `/edge/sync/heartbeat` | Status do Edge (online, versão, última sync) |
| GET | `/edge/sync/comandos` | Buscar comandos pendentes para o Edge |
| POST | `/edge/sync/comandos/:id/ack` | Confirmar execução de comando |

### Notificações push

| Método | Endpoint | Descrição |
|---|---|---|
| POST | `/dispositivos/registrar` | Registrar token FCM/APNs |
| DELETE | `/dispositivos/:token` | Remover dispositivo |

### Webhooks (ENTERPRISE)

| Método | Endpoint | Descrição |
|---|---|---|
| GET | `/webhooks` | Listar webhooks configurados |
| POST | `/webhooks` | Registrar novo webhook |
| DELETE | `/webhooks/:id` | Remover webhook |

Eventos disponíveis para webhook: `acesso.concedido`, `acesso.negado`, `visitante.autorizado`, `cadastro.aprovado`, `cadastro.reprovado`.

## Formato padrão de resposta

### Sucesso

```json
{
  "data": { ... },
  "meta": {
    "pagina": 1,
    "total": 128,
    "por_pagina": 20
  }
}
```

### Erro

```json
{
  "erro": {
    "codigo": "APROVACAO_NAO_ENCONTRADA",
    "mensagem": "A aprovação solicitada não existe ou não pertence ao seu tenant.",
    "detalhes": null
  }
}
```

## Rate limiting

| Perfil | Limite |
|---|---|
| App (morador/síndico) | 300 req/min por token |
| Edge Service | 1.000 req/min por tenant |
| Admin / Super Admin | 2.000 req/min |

Respostas com `429 Too Many Requests` incluem o header `Retry-After` em segundos.

## Versionamento da API

A versão está no path (`/v1`). Quebras de contrato introduzem `/v2` com período de deprecação de **6 meses** para a versão anterior. Edge Services recebem aviso de atualização via campo `api_deprecation_date` no heartbeat.

## Infraestrutura

- **Runtime**: Node.js 20 LTS, Fastify 4
- **Banco**: PostgreSQL 15 (schema per tenant)
- **Cache**: Redis 7 (sessões, rate limiting, filas de push)
- **Fila de tarefas**: BullMQ (notificações push, webhooks, sync em background)
- **Object storage**: MinIO ou S3 (fotos, documentos, backups de mídia do chat)
- **Deploy**: Docker, Kubernetes (EKS ou GKE), com HPA por CPU/memória
- **CI/CD**: GitHub Actions → ECR → Kubernetes rolling deploy

## Documentação relacionada

- [Edge Sync](../edge/edge-sync.md)
- [Multi-tenant](../database/multi-tenant.md)
- [Licenciamento SaaS](../docs/03-licenciamento-saas.md)
- [LGPD e Segurança](../docs/02-lgpd-e-seguranca.md)
