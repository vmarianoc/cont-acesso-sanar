# Chat Portaria

## Visão geral

Canal de mensagens em tempo real entre moradores e a portaria, integrado ao App Morador e ao painel da portaria. Funciona como um chat simples e direto, focado em comunicação operacional do dia a dia do condomínio.

## Casos de uso principais

- Morador avisa que vai receber uma entrega e pede para a portaria receber
- Porteiro avisa o morador que sua encomenda chegou
- Morador informa que um visitante vai chegar mais tarde
- Morador solicita abertura do portão de serviço
- Porteiro registra uma ocorrência e notifica o morador afetado
- Síndico envia aviso geral para todos os moradores

## Canais de conversa

| Canal | Participantes | Histórico |
|---|---|---|
| Unidade ↔ Portaria | Morador(es) da unidade + porteiro ativo | 90 dias |
| Aviso do Condomínio | Síndico → todos os moradores (broadcast) | Permanente |
| Grupo de Bloco | Moradores de um bloco + síndico | 90 dias |

O canal **Unidade ↔ Portaria** é o principal. Cada unidade tem o seu próprio canal, visível por todos os ocupantes cadastrados da unidade e pelo porteiro de plantão.

## Funcionalidades do chat

### Mensagens

- Texto simples com limite de 500 caracteres
- Emojis
- Foto (câmera ou galeria), com compressão automática para economizar banda
- Áudio (gravação direta no app, limite de 60 segundos)
- Localização (para visitantes informarem onde estão)

### Confirmações de leitura

- ✓ Enviada (chegou ao servidor)
- ✓✓ Lida pelo destinatário (com horário)

### Notificações

- Push notification com preview da mensagem
- Badge no ícone do app com contagem de não lidas
- Som configurável (importante para porteiros que precisam de alerta audível)
- No painel da portaria: janela popup para mensagens urgentes

### Avisos do condomínio (broadcast)

O síndico pode enviar mensagens para todos os moradores de uma vez:

- Texto + imagem (ex.: comunicado em PDF convertido para imagem)
- Programar envio (ex.: aviso de manutenção amanhã)
- Confirmação de leitura para avisos importantes
- Marcar como "urgente" (envia push prioritário, ignora horário de silêncio)

## Arquitetura técnica

A comunicação em tempo real usa **WebSocket** via socket.io:

```
App Morador ──► WebSocket ──► Edge Service (broker local)
                                    │
                                    ├── armazena mensagem (SQLite)
                                    ├── entrega para portaria (local)
                                    └── sincroniza com Cloud (quando online)
```

Quando o Edge está offline, as mensagens do App ficam em fila local e são entregues quando a conexão é restaurada. O porteiro sempre consegue ver o histórico de conversas, mesmo offline.

### Retenção de mensagens

- Mensagens ficam no Edge por **90 dias** e são sincronizadas para a Cloud
- Na Cloud, ficam disponíveis por **1 ano**
- Mídia (fotos, áudios) é armazenada em object storage (S3-compatible) com URL assinada

## Moderação e segurança

- Porteiros podem apenas responder para a unidade que iniciou a conversa
- Síndico pode ver todos os canais
- Mensagens não podem ser editadas após envio (preservação de integridade)
- Soft delete disponível para o autor da mensagem, mas o histórico permanece para auditoria

## Integração com outros módulos

- **Módulo Portaria**: botão de chat direto na ficha de visitante em andamento
- **Central SIP**: ao receber uma chamada da portaria, o morador vê o canal de chat da portaria aberto ao lado
- **Encomendas**: ao registrar uma encomenda, portaria pode enviar mensagem automática "Encomenda registrada — pode retirar na portaria"

## Documentação relacionada

- [Módulo Portaria](portaria.md)
- [App Morador](morador-app.md)
- [Central SIP](central-sip.md)
- [Edge Service](../edge/edge-service.md)
