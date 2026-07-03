# condar Edge Service (Go / appliance Linux)

Esqueleto inicial do Edge Service — o componente que roda localmente no
condomínio e fala com o hardware de controle de acesso (catracas, leitoras,
câmeras). Implementa o alvo **appliance Linux (Go)** descrito em
[`docs/edge/edge-service.md`](../docs/edge/edge-service.md) da Cloud API; o
alvo **Windows Service (.NET 8)** não foi iniciado.

Este diretório foi criado para ser extraído como repositório próprio (ver
"Extraindo para um repositório novo" no final deste arquivo) — o Edge tem
runtime, ciclo de release e instalação completamente diferentes da Cloud API
(Node/TypeScript) e dos apps web deste monorepo.

## O que já existe

- **`internal/config`** — carrega `config.yaml` (com defaults e override por
  variável de ambiente), no formato descrito na doc de arquitetura.
- **`internal/sync`** — cliente HTTP real contra os endpoints `/edge/*` da
  Cloud API (heartbeat, envio de eventos em lote, busca de comandos pendentes,
  validação de licença) + fila de eventos em memória.
- **`internal/hardware`** — interface `Adapter` comum + stubs para
  Hikvision, Intelbras e OSDP v2 (sem integração real com SDK — ver "O que
  falta" abaixo).
- **`internal/core`** — Core Engine: conecta os adapters, a Central SIP e roda
  os laços de sincronização (heartbeat, envio de eventos com intervalo
  adaptativo, polling de comandos), além de expor a API local.
- **`internal/localapi`** — servidor HTTP local com `/health`.
- **`internal/sip`** — ciclo de vida da Central SIP (stub — ver "O que falta").
- **`cmd/edge`** — binário principal.

Testado manualmente de ponta a ponta contra a Cloud API real deste
monorepo (`apps/api`): heartbeat e busca de comandos responderam `200`.

## O que falta (por design, fora do escopo deste esqueleto)

- **SQLite local (WAL + SQLCipher)** — a fila de eventos hoje é só em
  memória; eventos são perdidos se o processo cair antes de sincronizar.
- **Integração real com os SDKs** — Hikvision (MinMoe) e Intelbras exigem
  bibliotecas proprietárias dos fabricantes, não incluídas aqui. O adapter
  OSDP v2 é o mais viável de completar sem dependência proprietária (protocolo
  aberto), mas falta a camada serial/framing.
- **Flexisip (Central SIP)** — `internal/sip` só tem o ciclo de vida
  (`Iniciar`/`Parar`) plugado no Core Engine e na config (`sip.enabled`,
  `port_udp`, `port_tls`); com `enabled: true` ele loga um aviso claro e
  segue rodando em modo degradado (nunca derruba o Edge). Falta toda a
  integração real com o Flexisip (processo/binário próprio, não uma lib Go —
  ver comentário no topo de `internal/sip/server.go`) e o provisionamento de
  ramais por unidade descrito em `docs/modules/central-sip.md`.
- **API local completa** — falta servir o painel da portaria
  (`apps/web-portaria`) como estáticos, a API REST da portaria e o WebSocket
  de eventos em tempo real.
- **Execução de comandos** — `BuscarComandos` já funciona; aplicar o comando
  no hardware/local e confirmar de volta não está implementado.

## Gaps de contrato entre a documentação e a Cloud API atual

Ao implementar o cliente de sync contra a Cloud API real deste monorepo,
encontrei duas divergências entre `docs/edge/edge-sync.md` (aspiracional) e o
que `apps/api` de fato expõe hoje — o cliente Go segue o que **existe**:

1. **Autenticação do Edge**: a doc descreve mTLS + `X-Edge-Token` obtido via
   `POST /edge/auth`. Isso não existe na Cloud API hoje — as rotas
   `/edge/sync/*` usam o mesmo JWT Bearer dos usuários humanos
   (`fastify.authenticate`). Por ora, `config.yaml.edge_token` precisa ser um
   JWT válido emitido manualmente (ex.: via `/auth/login` com uma conta de
   serviço). Ver `internal/config/config.go`.
2. **Confirmação de comando**: a doc descreve
   `POST /edge/sync/comandos/:id/ack`; esse endpoint não está implementado em
   `apps/api/src/routes/edgeSync.ts` (só existe o `GET` de listagem). O método
   `Client.ConfirmarComando` em `internal/sync/client.go` existe como
   placeholder e retorna erro até o endpoint existir do lado Cloud.

## Rodando localmente

```bash
cd edge
cp config.example.yaml config.yaml   # edite tenant_id, schema_name, dispositivo_id, edge_token
go run ./cmd/edge --config config.yaml
```

## Testes

```bash
cd edge
go vet ./...
go test ./...
```

## Extraindo para um repositório novo

Para virar um repositório independente, a partir do diretório raiz deste
monorepo (branch `edge-service`):

```bash
# Opção 1 — extrai só este diretório mantendo o histórico de commits dele
git subtree split --prefix=edge -b edge-only
git push <novo-remoto> edge-only:main

# Opção 2 — mais simples, sem preservar histórico: clonar e copiar
git clone <este-repo> condar-edge && cd condar-edge
git checkout edge-service
# mover o conteúdo de edge/ para a raiz do novo repositório e commitar
```

Depois de extrair, vale atualizar o module path em `go.mod` (hoje
`github.com/condar/edge-service`) para o caminho real do novo repositório.
