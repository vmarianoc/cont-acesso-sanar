# Arquitetura Geral

## Visão da arquitetura

A plataforma opera em dois planos complementares: **Edge** (local no condomínio) e **Cloud** (SaaS central). A comunicação entre eles ocorre via HTTPS e WebSocket sobre TLS 1.3, com filas de sincronização tolerantes a falhas de rede.

```
┌─────────────────────────────────────────────────────────┐
│                      CLOUD (SaaS)                       │
│                                                         │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  │
│  │  Cloud API   │  │  Auth / IAM  │  │  Licenças    │  │
│  └──────┬───────┘  └──────────────┘  └──────────────┘  │
│         │ PostgreSQL multi-tenant (schema por tenant)   │
└─────────┼───────────────────────────────────────────────┘
          │ HTTPS + WebSocket (TLS 1.3)
┌─────────┼───────────────────────────────────────────────┐
│         │            EDGE (local)                       │
│  ┌──────▼───────┐  ┌──────────────┐  ┌──────────────┐  │
│  │ Edge Service │  │   SQLite DB  │  │ Flexisip SIP │  │
│  └──────┬───────┘  └──────────────┘  └──────────────┘  │
│         │                                               │
│  ┌──────▼───────────────────────────────────────────┐   │
│  │          Hardware Layer (SDK / RS-485)            │   │
│  │   Hikvision  ·  Intelbras  ·  Genérico OSDP      │   │
│  └──────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────┘
```

## Camada Edge

### Edge Service

Serviço Windows (instalável como Windows Service) ou appliance Linux embarcado. Responsabilidades:

- Gerenciar o banco de dados local (SQLite)
- Comunicar-se com o hardware de controle de acesso
- Manter o servidor SIP local (Flexisip)
- Sincronizar dados com a Cloud API
- Servir a interface web da portaria via localhost

**Requisitos mínimos de hardware:**
- CPU: Intel N100 ou equivalente (2 núcleos, 2 GHz)
- RAM: 4 GB
- Armazenamento: SSD 64 GB
- OS: Windows 10/11 LTSC ou Ubuntu 22.04 LTS

### Banco de dados local

SQLite com WAL mode para escrita concorrente segura. Tabelas principais:

- `condominios`, `blocos`, `unidades`
- `pessoas`, `veiculos`, `documentos`
- `acessos`, `eventos`, `visitantes`
- `sync_queue` (fila de sincronização pendente)

### Hardware integrado

| Fabricante | Protocolo | Recursos |
|---|---|---|
| Hikvision | SDK proprietário (MinMoe) | Biometria facial, QR, cartão |
| Intelbras | SDK / RS-485 | Biometria digital, cartão |
| Genérico | OSDP v2 | Cartão RFID / PIN |

## Camada Cloud

### Cloud API

API REST + WebSocket construída em **Node.js / Fastify**, hospedada em contêineres Docker (Kubernetes ou ECS). Responsabilidades:

- Autenticação e autorização (JWT + refresh token)
- Gestão de licenças e tenants
- Receber sincronizações dos Edges
- Servir o App Morador e App Síndico (mobile/web)
- Disparar notificações push (FCM / APNs)
- Webhooks para sistemas externos (Superlógica, Com21)

### Banco de dados Cloud

PostgreSQL 15+ com isolamento por schema por tenant (`tenant_{uuid}`). Cada schema contém a mesma estrutura de tabelas do Edge, mais tabelas exclusivas da Cloud:

- `aprovacoes`, `historico_aprovacoes`
- `auditoria` (imutável, append-only)
- `licencas`, `planos`
- `notificacoes`, `webhooks`

## Fontes de dados suportadas

| Fonte | Tipo | Método de importação |
|---|---|---|
| Superlógica | ERP condominial | API REST (webhook ou polling) |
| Com21 | ERP condominial | API REST |
| PDF | Documentos de moradores | OCR + extração por IA |
| Excel / CSV | Planilhas de moradores | Parser configurável |
| Mobile | App do morador | Formulário com validação |

## Fluxo de sincronização

```
Edge                    Cloud
 │                        │
 ├─── eventos locais ───► │  (acesso liberado, visitante registrado)
 │                        │
 │ ◄── cadastros novos ───┤  (morador aprovado pelo síndico)
 │                        │
 ├─── heartbeat (60s) ──► │  (status, versão, última sync)
 │                        │
 │ ◄── comandos ──────────┤  (bloquear unidade, atualizar biometria)
```

Quando o Edge fica offline, os eventos são enfileirados em `sync_queue` e enviados em lote quando a conectividade é restaurada. A Cloud mantém o estado autoritativo; o Edge é a fonte de verdade para eventos de acesso físico.

## Tecnologias principais

| Camada | Tecnologia |
|---|---|
| Cloud API | Node.js, Fastify, PostgreSQL, Redis |
| Edge Service | .NET 8 (Windows Service) / Go (appliance) |
| App Mobile | React Native (iOS + Android) |
| App Web (portaria) | React + Vite, PWA |
| SIP | Flexisip (Belledonne Communications) |
| Comunicação Edge↔Cloud | HTTPS REST + WebSocket (socket.io) |
| Infraestrutura Cloud | Docker, Kubernetes / AWS ECS |

## Documentação relacionada

- [Edge Service](../edge/edge-service.md)
- [Edge Sync](../edge/edge-sync.md)
- [Cloud API](../cloud/cloud-api.md)
- [Multi-tenant](../database/multi-tenant.md)
