# condar Edge Service (Windows) — Intelbras facial + LPR

Serviço local da guarita: integra os equipamentos Intelbras (controladores de
acesso facial e câmeras LPR) à Cloud API do condar. Decide **sempre**, mesmo
sem internet (modo degradado), e ressincroniza quando a conexão volta.

## O que ele faz

| Função | Como |
|---|---|
| Acesso veicular (LPR) | Recebe o push ANPR da câmera (HTTP), consulta `POST /edge/lpr` e abre a cancela (relé via HTTP API Intelbras) quando liberado |
| Acesso facial | Recebe o push do **Event Server BioT** (`/notification` + `/keepalive`), mapeia o `UserID` do equipamento para a pessoa e registra na Cloud (`POST /edge/validate-access`) |
| Cadastro vivo | Consome `GET /edge/sync/comandos` e aplica no equipamento via **API BioT V2 JSON** (`AccessUser`/`AccessFace` insertMulti) com ack; o mapa `pessoa_id ↔ UserID` fica no `edge.state.json` |
| Modo degradado | Cache local de placas de moradores ativos (`GET /edge/sync/placas`) + fila de eventos offline (`edge.state.json`), reenviada por `POST /edge/sync/eventos` |
| Licença | `POST /edge/validate-license` no boot com fingerprint do hardware (hostname + MACs) |
| Saúde | Heartbeat por dispositivo a cada ciclo de sync |

## Instalação no Windows

Pré-requisito: [Node.js 20 LTS](https://nodejs.org) (instalador Windows x64).

```powershell
# 1. Copie a pasta apps/edge para C:\condar-edge e instale as dependências
cd C:\condar-edge
npm install

# 2. Configure
copy edge.config.example.json edge.config.json
notepad edge.config.json   # cloud_url, tenant, licença, credenciais e dispositivos

# 3. Teste em primeiro plano
npm start                  # deve logar "licença validada" e "listener ANPR no ar"

# 4. Instale como serviço do Windows (NSSM — https://nssm.cc)
nssm install CondarEdge "C:\Program Files\nodejs\node.exe"
nssm set CondarEdge AppParameters "--import tsx src\index.ts"
nssm set CondarEdge AppDirectory "C:\condar-edge"
nssm set CondarEdge AppStdout "C:\condar-edge\edge.log"
nssm set CondarEdge AppStderr "C:\condar-edge\edge.err.log"
nssm set CondarEdge Start SERVICE_AUTO_START
nssm start CondarEdge
```

Libere a porta do listener ANPR no firewall do Windows (padrão 8090, apenas
rede local):

```powershell
netsh advfirewall firewall add rule name="Condar Edge ANPR" dir=in action=allow protocol=TCP localport=8090
```

## Configuração dos equipamentos Intelbras

**Câmera LPR** (interface web): *Evento → ANPR → Notificação HTTP*: aponte para
`http://<ip-do-edge>:8090/anpr` (método POST). Desative listas locais — a
decisão é da plataforma. O relé da cancela pode ficar na própria câmera ou na
controladora.

**QR de convite de visitante**: o morador gera o QR no app; o visitante
apresenta no leitor do controlador. O conteúdo lido (prefixo `V-`) chega ao
Edge pelo `/notification` e é validado na Cloud (`POST /edge/qr`) — liberado
dentro da janela, negado fora dela, sempre auditado. Habilite a leitura de
QR no equipamento (BioT: `configManager` → `QRCodeDecode`, ver collection).

**Controlador facial (BioT)**: cadastre o IP/usuário/senha no
`edge.config.json` (tipo `facial`) e rode `npm run provisionar` — o Edge
configura o Event Server do equipamento (eventos → `http://<edge>:8090/notification`,
keepalive em `/keepalive`) sem tocar na interface web. A base facial fica no
equipamento — decide offline sozinho; cada acesso é empurrado ao Edge e
registrado na Cloud.

Cada equipamento precisa existir em **Áreas e dispositivos** no app de
administração (tipo e área corretos); use o `dispositivo_id` no config.

## Usuário do Edge na Cloud

Crie um usuário dedicado (perfil `porteiro`) para o Edge — ex.
`edge@<condominio>.com.br` — na tela Usuários do síndico. É a credencial de
`email`/`senha` do config; troque-a se o Edge for comprometido.

## Atualização automática (OTA)

O Edge verifica a Cloud a cada 6 h (e 30 s após cada boot). Quando você
publica um release — `bash deploy/publicar-edge.sh 1.1.0 "notas"` no repo —
**todos os condomínios** baixam o pacote, conferem o sha256, fazem backup da
versão corrente em `rollback/` e reiniciam já atualizados. Se a versão nova
falhar 3 boots seguidos, o Edge **restaura a anterior sozinho** e segue
operando. As versões de cada condomínio aparecem em
`GET /admin/edge/releases` (heartbeat).

## Backup local reversível

Diariamente (e antes de todo update) o Edge copia `edge.config.json` e
`edge.state.json` (mapa pessoa↔UserID do BioT, cache de placas, fila
offline) para `backups/<data-hora>/`, mantendo 30. Perdeu/corrompeu algo:

```powershell
npm run restaurar          # lista os backups
npm run restaurar -- 2026-07-11-03-00-00
nssm restart CondarEdge
```

## Operação

- `edge.state.json` guarda o cache de placas e a fila offline — não apague com
  o serviço rodando.
- Logs em `edge.log` (JSON por linha). `"LPR em modo degradado"` indica Cloud
  inacessível; o acesso continua funcionando pelo cache.
- Sem placa no cache e sem Cloud → **negado** (fail-safe para veículos);
  o facial continua liberado pelo próprio controlador (fail-open residencial).
