# Módulos Futuros

Funcionalidades planejadas para fases após o MVP. Listadas em ordem aproximada de prioridade de negócio.

---

## Reconhecimento de Placa (LPR)

**Fase 2 — plano PRO/ENTERPRISE**

Leitura automática de placas de veículos na entrada e saída, usando câmeras IP com suporte a OCR embarcado (Hikvision, Intelbras ou câmera genérica com software LPR).

- Cancela abre automaticamente ao reconhecer placa cadastrada
- Alerta para placa não cadastrada (com foto)
- Integração com a lista de veículos do cadastro inteligente
- Relatório de movimentação de veículos

**Dependências:** câmera compatível, ponto de acesso com I/O para acionamento da cancela.

---

## Rateio de Água

**Fase 2 — plano PRO/ENTERPRISE**

Leitura e gestão de hidrômetros individuais por unidade, com rateio automático e relatório para a administradora.

- Coleta manual (leitura via app pelo zelador, com foto do hidrômetro)
- Coleta automática via módulo IoT (Modbus RTU / MQTT) — opcional
- Cálculo do consumo por unidade e geração de relatório para o ERP (Superlógica / Com21)
- Histórico de consumo com gráficos por unidade
- Alerta de vazamento (consumo anômalo detectado por IA)

---

## Ronda do Zelador

**Fase 2 — plano PRO/ENTERPRISE**

Controle de rondas de segurança com pontos de verificação (checkpoints) pelo condomínio.

- Zelador escaneia QR codes afixados nos pontos de ronda via app
- Rota configurável com horários esperados por ponto
- Alerta para o síndico se um ponto não for verificado no prazo
- Relatório de rondas realizadas por período
- Registro de ocorrências diretamente na ronda (texto + foto)

---

## Reservas de Espaços Comuns

**Fase 2 — plano PRO**

Agendamento de salão de festas, churrasqueira, academia, quadra e outros espaços.

- Calendário de disponibilidade em tempo real no App Morador
- Regras de reserva configuráveis: antecedência mínima/máxima, limite por morador/mês
- Aprovação automática ou pelo síndico (configurável por espaço)
- Cobrança de taxa de reserva integrada ao ERP (opcional)
- Notificação de confirmação e lembrete 24h antes
- Checklist de uso e vistoria pós-reserva

---

## Correspondências e Encomendas (aprimoramento)

**Fase 2 — plano START+**

Expansão do módulo básico de encomendas já no MVP:

- OCR do remetente/destinatário via foto da etiqueta
- QR code para retirada sem contato (morador escaneia no armário inteligente)
- Integração com lockers inteligentes (Parcel Pending, Quadient)
- Relatório de encomendas não retiradas após X dias
- Devolução registrada com foto e assinatura

---

## BI e Relatórios Avançados

**Fase 3 — plano ENTERPRISE**

Painel analítico para administradoras gerenciarem múltiplos condomínios:

- Dashboard consolidado com métricas de todos os condomínios
- Análise de fluxo de pessoas: horários de pico, distribuição por ponto de acesso
- Relatório de moradores com cadastro incompleto (segmentado por campo faltante)
- Exportação para Excel e PDF com branding da administradora
- Alertas proativos: Edge offline, queda de biometrias, pico de acessos negados
- Integração com ferramentas de BI externas via API (ENTERPRISE)

---

## IA para Gestão Preditiva

**Fase 3 — plano ENTERPRISE**

Uso de modelos de IA para análises que vão além de relatórios simples:

- **Detecção de anomalias**: acesso em horário incomum para aquela pessoa, acesso acelerado (anti-tailgating)
- **Reconhecimento facial aprimorado**: detectar pessoa que entrou sem registro (visitante não cadastrado)
- **Previsão de manutenção**: análise de padrões de falha de hardware (câmeras, catracas)
- **Assistente do síndico**: chatbot para responder perguntas sobre o condomínio ("quantas pessoas entraram hoje?", "qual unidade tem mais visitantes?")

---

## Portaria Remota

**Fase 3 — plano ENTERPRISE**

Central de monitoramento remoto para administradoras que oferecem serviço de portaria virtual.

- Porteiro remoto vê o feed de câmeras de múltiplos condomínios em uma única tela
- Atende chamadas SIP de qualquer condomínio da carteira
- Recebe alertas e libera acessos remotamente
- Gravação de chamadas e log de liberações para auditoria
- SLA configurável: tempo máximo de resposta por condomínio

---

## Integração Com21

**Fase 2**

Sincronização bidirecional com o ERP condominial Com21, similar à integração Superlógica já no MVP:

- Importação de unidades e moradores da Com21 via API
- Sincronização de inadimplência para bloquear/liberar acesso (configurável pelo síndico)
- Exportação de relatórios de acesso para a Com21

---

## Migração Intelbras

**Fase 2**

Expansão do módulo de migração para suportar controladores Intelbras (iSentri, SS 5530 MF, etc.):

- Importação via SDK Intelbras ou RS-485
- Suporte a biometria digital (ISO 19794-2)
- Mapeamento de zonas Intelbras para pontos de acesso da plataforma

---

## Administradora — recursos futuros

**Fase 3 — plano ENTERPRISE**

Funcionalidades adicionais para o perfil `administradora` (empresa que gerencia
vários condomínios), além da visão multi-condomínio já disponível hoje.

- **Notificações inteligentes**: alertas consolidados entre os condomínios da
  carteira (inadimplência, ocorrências recorrentes, licença perto de vencer),
  priorizados por urgência em vez de por condomínio.
- **Gestão de contratos**: cadastro e acompanhamento de contratos com
  fornecedores e prestadores de serviço por condomínio, com alertas de
  renovação/vencimento.
- **Gestão de compras**: cotação e acompanhamento de compras recorrentes
  (materiais de limpeza, manutenção) com histórico por condomínio.
- **Gestão de NF-e com DFe**: emissão e recebimento de notas fiscais
  eletrônicas integradas à Distribuição de DF-e da SEFAZ, vinculadas às
  despesas de cada condomínio.

---

## Documentação relacionada

- [Fase 1 — MVP](fase-1.md)
- [Visão Geral](../docs/00-visao-geral.md)
- [Licenciamento SaaS](../docs/03-licenciamento-saas.md)
