# Central SIP

## Visão geral

A Central SIP é um servidor VoIP embarcado no Edge Service, baseado no **Flexisip** (Belledonne Communications — mesmo stack do Linphone). Permite chamadas de voz e vídeo entre a portaria e os moradores usando o App Morador como ramal, sem necessidade de interfone físico ou operadora de telefonia.

## Capacidade

| Plano | Ramais | Chamadas simultâneas |
|---|---|---|
| START | 2 | 2 |
| PRO | 10 | 4 |
| ENTERPRISE | Configurável | Configurável |

Cada morador com App instalado recebe automaticamente um ramal SIP vinculado à sua unidade. A portaria tem um ramal fixo (`portaria@dominio.local`).

## Arquitetura SIP

```
App Morador (SIP client)
        │
        │  SIP + RTP (dentro da LAN)
        │  ou SRTP/TLS via TURN (fora da rede)
        ▼
  Flexisip (Edge Service)  ◄── registra e roteia chamadas
        │
        ▼
  App Portaria (SIP client)
```

O Flexisip roda na mesma máquina do Edge Service. Quando o App Morador está na rede local do condomínio (WiFi), a chamada é peer-to-peer dentro da LAN (baixíssima latência). Quando o morador está fora do condomínio, o Flexisip faz relay via TURN server embutido.

## Registro de ramais

- O ramal é criado automaticamente no Flexisip quando o morador é aprovado no cadastro
- As credenciais SIP são distribuídas automaticamente para o App Morador via API
- O morador não precisa configurar nada — o ramal aparece ativo no app após o cadastro ser aprovado
- Ramais inativos (morador sem app) são desativados automaticamente após 30 dias

## Tipos de chamada

| Tipo | Rota | Descrição |
|---|---|---|
| Portaria → Morador | Ramal da portaria → ramal da unidade | Chamada para autorizar visitante |
| Morador → Portaria | Ramal da unidade → ramal da portaria | Morador liga para a portaria |
| Morador → Morador | Ramal unidade A → ramal unidade B | Comunicação entre moradores *(opcional, configurável)* |
| Portaria → Grupo | Ramal portaria → todos os ramais de uma unidade | Chamar todos os ocupantes simultaneamente |

## Integração com o módulo Portaria

Quando o porteiro precisa acionar um morador para autorizar um visitante, pode:

1. Clicar no botão de chamada diretamente no painel de visitantes da portaria
2. O sistema disca automaticamente para o ramal do morador
3. Se o morador não atender em 30 segundos, o sistema tenta o próximo ocupante cadastrado na unidade
4. O morador vê no app: foto do visitante + nome + botão de autorizar/negar, mesmo durante a chamada

## Codecs suportados

- **Voz**: Opus (preferencial), G.711 (fallback), G.722
- **Vídeo**: H.264, VP8 (quando câmera da portaria disponível)
- **Criptografia**: SRTP + TLS para sinalização (obrigatório fora da LAN)

## Configuração

O administrador pode configurar no App Síndico:

- **Toque simultâneo**: chamar todos os ramais de uma unidade ao mesmo tempo ou em sequência
- **Encaminhamento**: se morador não atender, encaminhar para celular via WebRTC (requer ENTERPRISE)
- **Gravação de chamadas**: habilitada com consentimento explícito, armazenada por até 30 dias
- **Horário de silêncio**: bloquear chamadas da portaria em horários configurados (ex.: 22h–7h)

## Troubleshooting comum

| Problema | Causa provável | Solução |
|---|---|---|
| App não recebe chamadas | Notificações push desativadas | Verificar permissões de notificação no dispositivo |
| Qualidade ruim de áudio | Congestionamento na rede LAN | Configurar QoS (prioridade para pacotes RTP) no roteador |
| Chamada cai ao sair do WiFi | Ausência de TURN externo | Configurar servidor STUN/TURN externo no Edge |
| Ramal não registrado | Edge offline | Verificar status do Edge Service |

## Documentação relacionada

- [Módulo Portaria](portaria.md)
- [Chat Portaria](chat-portaria.md)
- [App Morador](morador-app.md)
- [Edge Service](../edge/edge-service.md)
