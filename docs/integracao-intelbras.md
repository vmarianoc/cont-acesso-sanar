# Integração Intelbras — controle de acesso e LPR

O primeiro condomínio em produção usa **controladores de acesso Intelbras**
(facial/catraca/cancela) e **câmeras LPR Intelbras** para acesso veicular.
Este documento descreve como o **Edge Service** (`apps/edge`, instalado na rede
local do condomínio como serviço do Windows) integra esses equipamentos à
Cloud API do condar. Instalação e operação: `apps/edge/README.md`.

## Arquitetura

```
[Leitor facial Intelbras]──┐                       ┌── POST /edge/validate-access
[Controladora / catraca]───┤  rede local           ├── POST /edge/lpr
[Câmera LPR Intelbras]─────┤──► Edge Service ──────┼── GET  /edge/sync/comandos
[Cancela]──────────────────┘   (Windows/Linux)     ├── POST /edge/validate-license
                                                   └── Cloud API (HTTPS)
```

O Edge é o único componente que fala com o hardware; a Cloud nunca acessa a
rede do condomínio diretamente. Os contratos `/edge/*` já estão implementados
e testados na Cloud (ver README, seção Edge).

## 1. Acesso veicular por LPR

As câmeras LPR Intelbras (linha VIP/DEFENDER IA) fazem o reconhecimento da
placa **no próprio equipamento** e notificam um servidor HTTP configurável
(push de evento ANPR). O fluxo:

1. A câmera lê a placa e envia o evento para o Edge (listener HTTP local).
2. O Edge normaliza e consulta a Cloud:

```http
POST /edge/lpr
Authorization: Bearer <token do Edge>
{
  "schema_name": "tenant_<uuid>",
  "dispositivo_id": "<uuid do dispositivo tipo 'lpr' cadastrado no admin>",
  "placa": "ABC1D23"
}
```

3. Resposta `{ data }`:

```json
{
  "resultado": "liberado",
  "motivo": "MORADOR_ATIVO",
  "area": "portaria",
  "placa": "ABC1D23",
  "pessoa_id": "…",
  "pessoa_nome": "Ana …"
}
```

Motivos possíveis: `MORADOR_ATIVO`, `LIBERACAO_VIGENTE` (reserva, visitante
pré-autorizado ou liberação manual/recorrente), `PLACA_DESCONHECIDA`,
`SEM_LIBERACAO_PARA_AREA`, `DISPOSITIVO_DESCONHECIDO`.

4. Se `liberado`, o Edge aciona a cancela (relé da própria câmera ou saída da
   controladora). Todo evento (liberado **e** negado) é registrado na Cloud
   com `metodo = 'placa'` e aparece no feed da portaria em tempo real.

Regras aplicadas pela Cloud (mesmas do facial, por área do dispositivo):
placa → veículo **ativo** → pessoa **ativa**; morador com vínculo ativo entra
na área `portaria`; demais áreas exigem liberação vigente (respeitando
recorrência e faixa horária). Placas são normalizadas (maiúsculas, sem
hífen/espaços) — formatos antigo (ABC1234) e Mercosul (ABC1D23) suportados.

### Configuração da câmera LPR Intelbras

1. No admin do condar, cadastre o dispositivo em **Áreas e dispositivos** com
   tipo **Câmera LPR (placas)** e a área correspondente (ex.: `portaria` para
   a entrada de veículos de moradores); guarde o `dispositivo_id`.
2. Na interface web da câmera: *Config. → Evento → ANPR/Lista de placas* —
   desative a lista local (a decisão é da plataforma) e configure o push de
   evento HTTP para o IP/porta do Edge.
3. Ligue a saída de relé à cancela (ou deixe o acionamento com a
   controladora, comandada pelo Edge).

## 2. Controladores de acesso (facial/catraca)

Os controladores Intelbras (linha SS/Block) mantêm a base facial **local**
para decidir offline; o Edge sincroniza essa base a partir da fila de
comandos da Cloud:

- `GET /edge/sync/comandos` — o Edge consome a `sync_queue`
  (criar/atualizar/remover pessoa, foto facial, revogações) e aplica no
  equipamento via API BioT V2 (`AccessUser.cgi`/`AccessFace.cgi` insertMulti,
  Digest MD5); o `UserID` numérico do BioT é mapeado do `pessoa_id`.
- Eventos de acesso chegam pelo **Event Server** do BioT (push HTTP para o
  Edge, `npm run provisionar` configura o equipamento).
- `POST /edge/validate-access` — a cada passagem o Edge valida na Cloud
  (liberações por área/agendamento) e registra o evento.
- Aprovações do Cadastro Vivo geram comandos automaticamente
  (`PATCH /aprovacoes/:id` → `sync_queue`).

## 3. Modo degradado (obrigatório)

A indisponibilidade da Cloud **nunca** pode travar portaria ou cancela:

- Facial: o controlador Intelbras decide localmente com a base sincronizada;
  o Edge enfileira os eventos e reenvia quando a conexão voltar.
- LPR: o Edge mantém cache local das placas de moradores ativos (atualizado a
  cada sync) e libera por ele quando `/edge/lpr` não responder em < 2s;
  eventos ficam na fila para reenvio.
- Licença: `POST /edge/validate-license` com vínculo de hardware por
  fingerprint; tolerância offline conforme plano.

## 4. Checklist de implantação

- [ ] Edge instalado na rede local com acesso HTTPS à Cloud.
- [ ] Dispositivos cadastrados no admin (tipo e área corretos) e IDs
      configurados no Edge.
- [ ] Push ANPR das câmeras LPR apontando para o Edge; teste com placa de
      morador (liberado) e placa desconhecida (negado + evento no feed).
- [ ] Base facial sincronizada nos controladores; teste de aprovação de
      cadastro → comando → equipamento.
- [ ] Teste de modo degradado: derrubar a rede WAN e validar facial + LPR.
