# Roadmap — Fase 1 (MVP)

## Objetivo

Lançar o produto com os dois pilares fundamentais da plataforma: **controle de acesso funcional** (substituindo sistemas legados) e **cadastro inteligente** (eliminando a digitação manual de dados). O MVP precisa estar completo o suficiente para um condomínio real migrar para ele e abandonar o sistema anterior.

## Escopo do MVP

### Incluído

| Funcionalidade | Módulo | Prioridade |
|---|---|---|
| Edge Service — Windows Service | Edge | P0 |
| Controle de acesso (Hikvision) | Edge / Portaria | P0 |
| Cadastro de moradores e unidades | Identidade | P0 |
| Painel da portaria (web local) | Portaria | P0 |
| Liberação de visitantes com notificação | Portaria / App Morador | P0 |
| App Morador (iOS + Android) | App Morador | P0 |
| Atualização cadastral com aprovação | Fluxo Aprovações | P0 |
| App Síndico — central de aprovações | App Síndico | P0 |
| Cloud API — auth, sync, push | Cloud API | P0 |
| Multi-tenant (schema per tenant) | Database | P0 |
| Licenciamento básico (START e PRO) | Licenciamento | P0 |
| Importação via CSV/Excel | Cadastro Inteligente | P1 |
| Migração Hikvision | Migração | P1 |
| Chat portaria ↔ morador | Chat Portaria | P1 |
| OCR de documentos (RG, CNH) | Cadastro Inteligente | P1 |
| Central SIP (ramal no app) | Central SIP | P2 |
| Integração Superlógica | Cloud API | P2 |

### Fora do MVP (próximas fases)

- Integração Com21
- Migração Intelbras
- Reconhecimento de placa (LPR)
- Reservas de espaços comuns
- Rateio de água
- BI e relatórios avançados
- API pública (webhooks) — plano ENTERPRISE

## Critérios de aceitação do MVP

Para o MVP ser considerado lançável, os seguintes critérios precisam estar atendidos:

**Controle de acesso:**
- [ ] Biometria facial funcional no Hikvision em produção
- [ ] Cartão RFID funcional
- [ ] Acesso liberado em < 500ms após leitura biométrica
- [ ] Sistema funcional por 72h sem internet (teste de isolamento)

**Cadastro e aprovações:**
- [ ] Morador consegue atualizar foto e veículo sem contato com a portaria
- [ ] Síndico aprova/reprova no app em < 3 toques
- [ ] Mudança aplicada no hardware em < 60s após aprovação

**Migração:**
- [ ] Migração de 500 moradores do Hikvision em < 2 horas
- [ ] Zero acessos negados após migração para moradores existentes

**Qualidade:**
- [ ] Uptime do Edge Service > 99,5% em teste de 30 dias
- [ ] Latência P95 da Cloud API < 300ms
- [ ] Nenhuma vulnerabilidade crítica ou alta no último pentest

## Marcos (milestones)

| Marco | Entregável | Estimativa |
|---|---|---|
| M1 — Core | Edge Service + painel portaria + Hikvision | Mês 3 |
| M2 — App | App Morador + App Síndico + aprovações | Mês 5 |
| M3 — Cloud | Cloud API completa + multi-tenant + licenças | Mês 6 |
| M4 — Cadastro | OCR, importação CSV, migração Hikvision | Mês 7 |
| M5 — Beta | Piloto em 2 condomínios reais | Mês 8 |
| M6 — Launch | Chat, SIP, ajustes do beta, lançamento geral | Mês 10 |

## Piloto (M5)

Critérios de seleção para condomínios piloto:
- 1 pequeno (≤ 50 unidades, plano START): validar simplicidade de instalação
- 1 médio (100–300 unidades, plano PRO): validar escalabilidade e migração

Durante o piloto:
- Acesso direto ao canal do Slack com a equipe de desenvolvimento
- Bug reports priorizados (SLA de 4h para P0, 24h para P1)
- Feedback semanal estruturado (formulário + call opcional)
- Condomínio piloto recebe 6 meses gratuitos após o lançamento

## Riscos identificados

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| SDK Hikvision com breaking change | Média | Alto | Versão do SDK pinada, ambiente de teste com hardware real |
| Latência SIP em redes lentas | Alta | Médio | OPUS codec + TURN server embutido |
| Resistência de porteiros ao app | Alta | Alto | UX simplificada, treinamento presencial no piloto |
| Perda de dados na migração | Baixa | Alto | Dry-run obrigatório + backup antes de cada migração |
| LGPD — biometria sem consentimento | Média | Alto | Tela de consentimento explícita no primeiro acesso do morador |

## Documentação relacionada

- [Visão Geral](../docs/00-visao-geral.md)
- [Arquitetura Geral](../docs/01-arquitetura-geral.md)
- [Migração](../modules/migracao.md)
- [Módulos Futuros](modulos-futuros.md)
