# Visão Geral da Plataforma

## Conceito

A **Access Platform** é uma plataforma SaaS de controle de acesso e gestão condominial, projetada para condomínios residenciais e comerciais de qualquer porte. Ela combina um serviço de borda local (Edge Service) rodando no condomínio com uma nuvem central, garantindo operação contínua mesmo sem internet.

O diferencial central é o **Cadastro Vivo**: os dados de moradores, veículos e visitantes são mantidos atualizados de forma colaborativa e descentralizada, com aprovações feitas pelo próprio síndico e moradores via app — eliminando a dependência de digitação manual na portaria.

## Problemas que resolve

| Problema atual | Solução na plataforma |
|---|---|
| Cadastro desatualizado na portaria | Moradores atualizam os próprios dados via app, com aprovação do síndico |
| Portaria bloqueada por falta de internet | Edge Service local garante acesso offline |
| Integração manual com sistemas de controle de acesso | Sincronização automática com Hikvision, Intelbras e outros |
| Comunicação ineficiente morador-portaria | Chat integrado e Central SIP com ramal no app |
| Falta de auditoria e rastreabilidade | Versionamento completo, logs de acesso e conformidade LGPD |

## Principais módulos

- **Portaria** — monitoramento em tempo real, liberação de visitantes, câmeras e eventos de acesso
- **App Morador** — cadastro próprio, solicitação de acesso, comunicação com portaria
- **App Síndico** — central de aprovações, relatórios e configurações do condomínio
- **Cadastro Inteligente** — importação via OCR + IA de documentos, planilhas e sistemas legados
- **Central SIP** — ramal VoIP embarcado para chamadas portaria-morador
- **Chat Portaria** — mensagens em tempo real entre portaria e moradores
- **Fluxo de Aprovações** — workflow configurável para alterações cadastrais
- **Migração** — importação de bases existentes (Hikvision, Intelbras, Excel, CSV)

## Arquitetura em camadas

```
┌────────────────────────────────────────────┐
│              Cloud API (SaaS)              │
│  Licenciamento · Sync · BI · Notificações  │
└─────────────────────┬──────────────────────┘
                      │ HTTPS / WebSocket
┌─────────────────────▼──────────────────────┐
│            Edge Service (local)            │
│  Controle de acesso · SIP · Câmeras · DB   │
└─────────────────────┬──────────────────────┘
                      │ SDK / RS-485 / TCP
┌─────────────────────▼──────────────────────┐
│        Hardware (catracas, câmeras)        │
│       Hikvision · Intelbras · Genérico     │
└────────────────────────────────────────────┘
```

## Público-alvo

- **Administradoras de condomínio** que gerenciam múltiplos empreendimentos (multi-tenant)
- **Síndicos profissionais** que precisam de visibilidade e controle remoto
- **Porteiros e zeladores** que necessitam de interface simples e resiliente
- **Moradores** que querem autonomia e transparência sobre seus próprios dados

## Diferenciais competitivos

1. **Offline-first**: o controle de acesso nunca para, mesmo sem internet
2. **Cadastro colaborativo**: moradores e síndico mantêm os dados, não a portaria
3. **Multi-tenant nativo**: uma instalação Cloud serve centenas de condomínios
4. **Conformidade LGPD**: auditoria, consentimento e soft delete nativos
5. **SIP embarcado**: ramal de voz sem custo adicional de infraestrutura

## Documentação relacionada

- [Arquitetura Geral](01-arquitetura-geral.md)
- [LGPD e Segurança](02-lgpd-e-seguranca.md)
- [Licenciamento SaaS](03-licenciamento-saas.md)
- [Roadmap — Fase 1](../roadmap/fase-1.md)
