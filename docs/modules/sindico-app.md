# App Síndico

## Visão geral

O App Síndico é o painel de controle do síndico e da administradora. Disponível como aplicativo móvel (iOS/Android) e interface web. É a **central de aprovações** e o ponto de gestão do condomínio, com visibilidade sobre cadastros, acessos e configurações.

## Perfis de acesso

| Perfil | Quem usa | Permissões |
|---|---|---|
| Síndico | Síndico eleito ou profissional | Aprovações, relatórios, configurações do condomínio |
| Subsíndico | Representante do síndico | Aprovações, relatórios (sem alterar configurações críticas) |
| Administradora | Funcionário da administradora | Gestão multi-tenant, planos, relatórios consolidados |
| Conselheiro | Membro do conselho | Somente leitura de relatórios e lista de moradores |

## Central de Aprovações

O coração do app. Todas as solicitações que exigem revisão aparecem aqui:

### Tipos de aprovação

| Tipo | Prazo sugerido | Ação padrão se expirar |
|---|---|---|
| Solicitação de titularidade | 5 dias úteis | Manter status atual |
| Atualização de cadastro (dados sensíveis) | 48 horas | Reprovar automaticamente |
| Cadastro de funcionário doméstico | 48 horas | Reprovar automaticamente |
| Pré-autorização de visitante recorrente | 24 horas | Reprovar automaticamente |
| Solicitação de reserva de espaço | 24 horas | Aprovar automaticamente (configurável) |

### Fluxo de aprovação

Cada solicitação na fila exibe:
- Foto e nome do solicitante
- Unidade e tipo de alteração
- Documentos comprobatórios anexados (ex.: contrato de locação)
- Comparação lado a lado: **antes** × **depois** das alterações
- Histórico de solicitações anteriores da mesma pessoa

O síndico pode:
- **Aprovar**: alteração aplicada imediatamente no Edge e na Cloud
- **Reprovar**: com justificativa obrigatória, enviada ao morador por push e e-mail
- **Solicitar documentação adicional**: pausa o prazo e notifica o morador
- **Delegar**: encaminhar para outro aprovador (ex.: conselheiro)

### Aprovações em lote

Para situações de migração ou atualização massiva, o síndico pode selecionar múltiplas solicitações do mesmo tipo e aprovar/reprovar em lote.

## Monitoramento do condomínio

### Dashboard principal

- Total de moradores cadastrados e pendentes de aprovação
- Acessos nas últimas 24 horas (gráfico por hora)
- Visitantes ativos agora no condomínio
- Alertas de segurança recentes
- Status do Edge Service (online/offline, última sync, versão)

### Relatórios disponíveis

| Relatório | Periodicidade | Exportação |
|---|---|---|
| Acessos por unidade | Diário / Mensal | PDF, CSV |
| Visitantes por período | Livre | PDF, CSV |
| Ocorrências da portaria | Mensal | PDF |
| Histórico de aprovações | Livre | CSV |
| Moradores inadimplentes (integração ERP) | Mensal | PDF |

## Configurações do condomínio

### Estrutura física

- Cadastrar blocos, torres e unidades
- Definir pontos de acesso (catracas, cancelas, portões) e suas zonas
- Configurar câmeras IP e layout do painel da portaria

### Regras de acesso

- Horários de funcionamento de cada ponto de acesso
- Perfis de acesso: moradores, funcionários domésticos, prestadores, visitantes
- Blacklist: bloquear acesso de pessoa específica com justificativa registrada
- Modo de segurança elevada: exige biometria para todos os acessos

### Fluxo de aprovações

- Definir quais campos cadastrais exigem aprovação
- Configurar prazos e ação padrão por vencimento
- Habilitar aprovação em dois fatores (síndico + conselheiro) para alterações críticas

### Notificações

- Configurar quais eventos geram alertas para o síndico
- Definir horário de não-perturbe
- Escalar alertas para subsíndico se não respondido em X minutos

## Transição de mandato (troca de síndico)

A troca de síndico é o momento de maior risco operacional: feita errado, gera perda de acesso, aprovações órfãs e quebra de continuidade. O processo é assistido:

1. **Início da transição**: a administradora (ou o síndico atual) registra a eleição/troca, informando o novo responsável e a data efetiva
2. **Período de sobreposição**: por um intervalo configurável (padrão 15 dias), síndico anterior e novo têm acesso simultâneo, permitindo passagem de bastão sem vácuo
3. **Transferência de pendências**: solicitações em aberto na Central de Aprovações são reatribuídas ao novo síndico; nenhuma decisão pendente se perde
4. **Revogação de acesso**: ao fim da sobreposição, o acesso do síndico anterior é automaticamente rebaixado para morador comum
5. **Registro imutável**: toda a transição fica registrada na auditoria — quem entrou, quem saiu, quando e quem autorizou

O histórico de aprovações e configurações permanece vinculado ao condomínio, não ao síndico — garantindo continuidade institucional mesmo com a rotatividade de mandatos.

> O mesmo fluxo se aplica a subsíndicos e conselheiros, e à substituição de porteiros (gerida pela administradora ou pelo síndico).

## Integração com ERPs condominiais

*(Plano PRO/ENTERPRISE)*

| Sistema | Dados sincronizados |
|---|---|
| Superlógica | Lista de unidades, inadimplência, dados de moradores |
| Com21 | Lista de unidades, inadimplência, dados de moradores |

A sincronização é unidirecional: o ERP é a fonte de verdade para dados financeiros e de propriedade; a plataforma complementa com dados de acesso e cadastro vivo.

## Visão multi-tenant (Administradora)

Administradoras com plano Enterprise têm uma camada adicional:

- Lista de todos os condomínios gerenciados com status em tempo real
- Painel de aprovações consolidado (ver pendências de todos os condomínios)
- Relatórios comparativos entre condomínios
- Gestão de contratos e licenças por condomínio
- Criar e desativar tenants sem precisar de suporte

## Documentação relacionada

- [App Morador](morador-app.md)
- [Fluxo de Aprovações](fluxo-aprovacoes.md)
- [Módulo Portaria](portaria.md)
- [Licenciamento SaaS](../docs/03-licenciamento-saas.md)
- [Multi-tenant](../database/multi-tenant.md)
