# Módulo Portaria

## Visão geral

O módulo Portaria é a interface principal dos porteiros e zeladores. Roda como aplicação web (PWA) servida pelo Edge Service, acessível via navegador no computador da guarita. Opera **100% offline** — toda ação que o porteiro executa é processada localmente e sincronizada com a Cloud quando há conectividade.

## Funcionalidades

### Monitoramento em tempo real

- **Dashboard de eventos**: listagem cronológica de todos os eventos de acesso (entrada/saída) com foto, nome, unidade e horário
- **Status dos pontos de acesso**: indica quais catracas, cancelas e portões estão online, com alarme visual em caso de falha
- **Feed de câmeras**: visualização ao vivo de câmeras IP integradas (RTSP), com suporte a até 16 câmeras simultâneas no layout de grid
- **Contador de ocupação**: número de pessoas dentro do condomínio em tempo real

### Visitantes

Fluxo de entrada de visitante:

1. Porteiro abre o formulário de visitante
2. Informa nome, documento e quem vai visitar
3. Tira foto com webcam (opcional, mas recomendado)
4. Sistema consulta se o visitante já tem cadastro anterior
5. Envia notificação push para o morador: **"Pedro da Silva está na portaria para visitar você. Autorizar?"**
6. Morador responde no app; porteiro vê a resposta em tempo real
7. Se autorizado: acesso liberado automaticamente, tag impressa (se impressora configurada)
8. Se não autorizado ou sem resposta em 2 minutos: porteiro decide manualmente

O histórico de visitas é salvo e o visitante pode ser pré-autorizado para próximas visitas pelo morador.

### Pré-autorização de visitantes

Moradores podem pré-autorizar visitantes pelo App Morador. Na portaria, o sistema identifica o visitante pela câmera (se biometria facial ativa) ou pela busca manual e libera sem precisar acionar o morador.

### Acessos de moradores e funcionários

- Leitura de biometria (face, digital) ou cartão RFID no equipamento
- Evento registrado automaticamente com foto, horário e ponto de acesso
- Alarme visual e sonoro em caso de acesso negado
- Log de acesso com filtros por pessoa, unidade, data e ponto de acesso

### Ocorrências e relatórios

- Registro de ocorrências livres (texto + foto) vinculadas a uma unidade ou área comum
- Relatório de visitantes por período
- Relatório de acessos por unidade
- Exportação em PDF ou CSV (requer sincronização com a Cloud)

## Interface da portaria

A tela principal é dividida em três áreas:

```
┌────────────────────────────────────────────────────────┐
│  [Logo]  Condomínio X   Porteiro: João   19:42  [Sync] │
├────────────────┬───────────────────────────────────────┤
│                │                                       │
│  Feed de       │   Últimos eventos                     │
│  câmeras       │   ─────────────────────────────────── │
│  (grid)        │   18:41  Ana Lima · Apto 203 · Entrada│
│                │   18:39  Pedro S. · Visitante · Saída │
│                │   18:35  Carlos M. · Apto 501 · Entrada│
│                │                                       │
├────────────────┴───────────────────────────────────────┤
│  [+ Registrar Visitante]  [Buscar Morador]  [Ocorrência]│
└────────────────────────────────────────────────────────┘
```

## Operação offline

Quando o Edge perde conexão com a Cloud:

- Indicador "Offline" aparece no cabeçalho (sem bloquear o uso)
- Todos os dados de moradores, biometrias e veículos são consultados localmente
- Notificações push para moradores ficam em fila (enviadas quando reconectar)
- Eventos de acesso são salvos em `sync_queue`
- Ao reconectar: sincronização automática em background, sem intervenção do porteiro

## Configurações disponíveis (perfil Síndico/Admin)

- Tempo de espera para autorização de visitante (padrão: 2 minutos)
- Ação padrão se morador não responder (negar ou liberar)
- Câmeras ativas e layout do grid
- Pontos de acesso e horários de funcionamento
- Regras de acesso por perfil (moradores, funcionários, prestadores)

## Documentação relacionada

- [Chat Portaria](chat-portaria.md)
- [Central SIP](central-sip.md)
- [App Morador](morador-app.md)
- [Fluxo de Aprovações](fluxo-aprovacoes.md)
- [Edge Service](../edge/edge-service.md)
