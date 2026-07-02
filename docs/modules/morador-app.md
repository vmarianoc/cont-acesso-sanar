# App Morador

## Visão geral

Aplicativo móvel (iOS e Android) que dá autonomia ao morador para gerenciar seus próprios dados cadastrais, autorizar visitantes e se comunicar com a portaria, sem depender de intermediários.

## Autenticação e primeiro acesso

1. O síndico ou administradora cadastra a unidade e vincula um e-mail ao morador
2. O morador recebe um convite por e-mail ou WhatsApp
3. No primeiro acesso, define senha e opcionalmente cadastra biometria (face ou digital) pelo próprio app
4. MFA opcional (TOTP) disponível para perfis de proprietário

## Funcionalidades

### Atualização cadastral (Cadastro Vivo)

O morador pode atualizar seus próprios dados a qualquer momento:

- **Dados pessoais**: nome, telefone, e-mail de contato
- **Documentos**: foto do RG, CPF, CNH (com OCR automático para preencher campos)
- **Foto de perfil**: usada para reconhecimento facial na portaria
- **Veículos**: placa, modelo, cor, vaga vinculada
- **Dependentes**: filhos, cônjuge, agregados — cada um com foto e documento
- **Funcionários domésticos**: diaristas, babás, cuidadores, com horários de acesso permitidos

Toda atualização gera uma **solicitação de aprovação** enviada ao síndico, exceto campos de baixo risco (telefone, e-mail de contato) que são atualizados diretamente.

### Solicitação de titularidade

Quando um imóvel muda de dono ou inquilino, o novo morador pode solicitar titularidade da unidade:

1. Informa número da unidade e bloco
2. Faz upload do contrato (locação ou escritura)
3. Síndico recebe notificação e aprova ou rejeita com justificativa
4. Ao aprovar: morador anterior perde acesso, novo morador recebe acesso

### Autorização de visitantes

- Recebe notificação push quando um visitante chega à portaria
- Pode **Autorizar** ou **Negar** com um toque
- Pré-autorizar visitantes frequentes (nome + documento) — portaria libera automaticamente
- Definir janelas de acesso (ex.: "diarista toda segunda das 8h às 17h")
- Histórico de todas as visitas à sua unidade

### Comunicação com a portaria

- Chat em tempo real com a portaria (ver [Chat Portaria](chat-portaria.md))
- Chamada VoIP via ramal SIP integrado (ver [Central SIP](central-sip.md))
- Histórico de conversas por até 90 dias

### Encomendas e entregas

- Notificação quando uma encomenda é registrada na portaria
- Confirmação de retirada com assinatura digital no app
- Histórico de encomendas

### Reservas de espaços comuns *(plano PRO/ENTERPRISE)*

- Solicitar reserva de salão de festas, churrasqueira, academia
- Aprovação automática ou pelo síndico (configurável)
- Calendário de disponibilidade em tempo real

### Transparência de acessos da minha unidade

Por confiança e por direito do titular (LGPD), o morador pode consultar:

- Histórico de entradas e saídas dos ocupantes da própria unidade
- Visitas recebidas (autorizadas, negadas e por quem foram autorizadas)
- Veículos que acessaram vinculados à unidade
- Tentativas de acesso negado (alerta de possível uso indevido de credencial)

O morador vê apenas dados da própria unidade — nunca de terceiros.

### Meus dados (LGPD)

- Exportar todos os dados cadastrais em PDF ou JSON
- Solicitar exclusão de dados (envia solicitação formal ao síndico e administradora)
- Ver histórico completo de alterações nos próprios dados
- Gerenciar consentimentos (ex.: revogar uso de biometria facial)

## Acesso compartilhado da unidade

Uma unidade costuma ter vários ocupantes (cônjuge, filhos, dependentes). As regras de autorização precisam ser claras para evitar conflitos:

- **Quem pode autorizar visitantes**: por padrão, qualquer ocupante adulto com vínculo ativo. O titular pode restringir a autorização apenas a si mesmo nas configurações.
- **Notificação simultânea**: quando um visitante chega, todos os ocupantes habilitados recebem a notificação ao mesmo tempo.
- **Primeira resposta vence**: a primeira decisão registrada (autorizar/negar) é aplicada; as notificações dos demais são encerradas com aviso de quem decidiu.
- **Empate impossível**: o sistema bloqueia decisões conflitantes após a primeira resposta, eliminando ambiguidade na portaria.
- **Visibilidade**: o histórico de visitas mostra qual ocupante autorizou cada visitante.

## Botão de pânico / emergência

Função de segurança acessível em até dois toques no app:

- Aciona alerta prioritário imediato para a portaria, com nome, unidade e localização
- Opcionalmente abre chamada SIP automática com a portaria
- Registra o evento como ocorrência crítica (não pode ser editado nem excluído)
- Configurável pelo síndico: notificar também subsíndico, zelador ou central de monitoramento remoto
- Modo "acionamento silencioso" para situações de coação (alerta a portaria sem feedback visível na tela)

## Acessibilidade e moradores sem smartphone

O Cadastro Vivo não pode excluir quem não usa app. Alternativas previstas:

- **Portal web responsivo**: todas as funções do app disponíveis em navegador, sem necessidade de instalação
- **Delegação de cadastro**: um ocupante da unidade (ou o síndico) pode manter o cadastro de um morador que não usa tecnologia, com registro de quem fez a alteração
- **Autorização por voz/ligação**: quando o morador não tem app, a portaria aciona o ramal SIP ou telefone cadastrado para autorização verbal, registrada no log
- **Acessibilidade no app**: suporte a leitor de tela (VoiceOver/TalkBack), fontes ampliáveis, alto contraste e textos em linguagem simples

## Morador sem conectividade

Se o morador estiver sem internet no momento em que um visitante chega:

- A notificação fica em fila e é entregue assim que o aparelho reconectar
- A portaria não fica travada: após o tempo de espera configurado, segue a ação padrão definida pelo síndico (negar ou liberar) ou aciona outro ocupante da unidade
- Pré-autorizações cadastradas previamente continuam válidas mesmo com o morador offline

## Notificações

| Evento | Canal |
|---|---|
| Visitante na portaria | Push + vibração |
| Encomenda recebida | Push |
| Solicitação de cadastro aprovada/rejeitada | Push + e-mail |
| Mensagem da portaria | Push + badge |
| Alerta de segurança (ex.: tentativa de acesso negado) | Push prioritário |

## Permissões necessárias no dispositivo

- **Câmera**: para foto de perfil e documentos
- **Notificações**: para receber alertas em tempo real
- **Microfone**: para chamadas VoIP
- **Biometria local** (Face ID / impressão digital): para desbloqueio rápido do app

## Requisitos mínimos

- iOS 14+ ou Android 10+
- Conexão com internet (funcionalidades de autorização requerem conectividade)

## Documentação relacionada

- [App Síndico](sindico-app.md)
- [Chat Portaria](chat-portaria.md)
- [Central SIP](central-sip.md)
- [Fluxo de Aprovações](fluxo-aprovacoes.md)
- [LGPD e Segurança](../docs/02-lgpd-e-seguranca.md)
