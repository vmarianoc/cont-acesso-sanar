# Edge Service

## Visão geral

O Edge Service é o componente local instalado no condomínio. É o ponto de contato entre o hardware físico (catracas, câmeras, leitoras) e a plataforma Cloud. Garante operação contínua mesmo sem internet, pois todo o controle de acesso é processado localmente.

## Modos de implantação

### Windows Service

Instalador `.msi` que registra o serviço no Windows Service Manager. Ideal para condomínios com computador existente na portaria.

- **OS**: Windows 10/11 LTSC, Windows Server 2019+
- **Runtime**: .NET 8 (self-contained, sem necessidade de instalar o .NET separadamente)
- **Instalação**: wizard gráfico com configuração assistida

### Appliance Linux

Imagem de disco pré-configurada para hardware embarcado (mini PC ou appliance dedicado).

- **OS**: Ubuntu 22.04 LTS (minimal)
- **Runtime**: binário Go compilado estaticamente
- **Acesso**: SSH para manutenção remota, sem interface gráfica local

## Requisitos de hardware

| Cenário | CPU | RAM | Armazenamento | Rede |
|---|---|---|---|---|
| Pequeno (até 50 unidades) | Intel N100 / 2 núcleos | 4 GB | SSD 64 GB | 100 Mbps |
| Médio (até 500 unidades) | Intel i3 / 4 núcleos | 8 GB | SSD 128 GB | 1 Gbps |
| Grande (500+ unidades) | Intel i5 / 6 núcleos | 16 GB | SSD 256 GB | 1 Gbps |

Câmeras RTSP consomem banda local significativa — planejar rede separada (VLAN) para câmeras.

## Componentes internos

```
┌────────────────────────────────────────────────────┐
│                  Edge Service                      │
│                                                    │
│  ┌──────────────┐   ┌────────────┐  ┌──────────┐  │
│  │  API local   │   │  SQLite DB │  │ Flexisip │  │
│  │  (portaria)  │   │  (WAL mode)│  │  (SIP)   │  │
│  └──────┬───────┘   └─────┬──────┘  └────┬─────┘  │
│         │                 │              │         │
│  ┌──────▼─────────────────▼──────────────▼──────┐  │
│  │           Core Engine                        │  │
│  │  (eventos, acesso, sync, hardware)           │  │
│  └──────────────────────┬───────────────────────┘  │
│                         │                          │
│  ┌──────────────────────▼───────────────────────┐  │
│  │           Hardware Adapters                  │  │
│  │  Hikvision SDK · Intelbras SDK · OSDP v2    │  │
│  └──────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────┘
```

### API local (portaria)

Servidor HTTP na porta `8080` (configurável), acessível apenas na rede local. Serve:

- Interface web da portaria (React PWA, servida como arquivos estáticos)
- API REST para o painel da portaria
- WebSocket para eventos em tempo real (feed de câmeras, acessos)

### SQLite (banco local)

- WAL mode ativado para leituras e escritas simultâneas sem bloqueio
- SQLCipher para criptografia em repouso
- Tamanho máximo configurável (padrão: 8 GB); eventos antigos são arquivados automaticamente

### Flexisip (SIP)

Servidor SIP embarcado para a Central SIP. Roda na porta UDP `5060` e TCP `5061` (TLS). Ver [Central SIP](../modules/central-sip.md).

### Hardware Adapters

Módulos plugáveis para comunicação com equipamentos:

| Adapter | Protocolo | Eventos suportados |
|---|---|---|
| Hikvision | MinMoe SDK (TCP) | Acesso, alarme, anti-passback |
| Intelbras | SDK + RS-485 | Acesso, alarme |
| OSDP v2 | RS-485 | Acesso, status do leitor |
| Câmera genérica | RTSP | Streaming para o painel |

## Ciclo de inicialização

```
1. Carregar configuração (config.yaml ou registry do Windows)
2. Conectar ao SQLite local
3. Verificar licença (cache local → Cloud API)
4. Inicializar adapters de hardware
5. Iniciar Flexisip
6. Iniciar API local (portaria)
7. Iniciar loop de sincronização com Cloud
8. Registrar heartbeat inicial na Cloud
```

## Operação offline

Quando a conectividade com a Cloud é perdida:

- O controle de acesso opera **normalmente** com os dados locais
- Notificações push para moradores ficam em fila (`sync_queue`)
- Aprovações do síndico feitas no app ficam pendentes na Cloud; o Edge não as recebe até reconectar
- O painel da portaria continua funcionando (acesso via rede local)
- Câmeras continuam transmitindo via RTSP local

Ao reconectar:
1. Edge drena a `sync_queue` (eventos de acesso acumulados)
2. Busca comandos pendentes da Cloud (cadastros aprovados, bloqueios, etc.)
3. Aplica comandos e confirma execução

## Atualização do Edge Service

Atualizações são entregues pela Cloud:

1. Cloud sinaliza versão disponível no próximo heartbeat
2. Edge baixa o novo binário (hash verificado)
3. Edge aguarda janela de baixo uso (configurável, padrão: 02h–04h)
4. Edge para os serviços, substitui o binário, reinicia
5. Se a nova versão não inicializar em 60s: rollback automático para versão anterior

O processo é transparente para a portaria — downtime de < 30 segundos durante o restart.

## Configuração

O arquivo `config.yaml` (Windows) ou variáveis de ambiente (appliance) controlam:

```yaml
tenant_id: "uuid-do-condominio"
edge_token: "token-de-autenticacao"
cloud_api_url: "https://api.accessplatform.com.br"

database:
  path: "./data/edge.db"
  max_size_gb: 8

hardware:
  hikvision:
    enabled: true
    host: "192.168.1.100"
    port: 8000
    username: "admin"
    password: "..."

sip:
  enabled: true
  port_udp: 5060
  port_tls: 5061

local_api:
  port: 8080
  bind: "0.0.0.0"  # ou "127.0.0.1" para restringir à máquina local
```

## Monitoramento e logs

- Logs estruturados em JSON, nível configurável (`debug`, `info`, `warn`, `error`)
- Rotação automática de logs (máximo 7 dias ou 1 GB por arquivo)
- Métricas exportadas via `/metrics` (Prometheus-compatible)
- Alertas enviados para a Cloud em caso de falha crítica (hardware desconectado, disco cheio, etc.)

## Documentação relacionada

- [Edge Sync](edge-sync.md)
- [Central SIP](../modules/central-sip.md)
- [Módulo Portaria](../modules/portaria.md)
- [Migração](../modules/migracao.md)
- [Arquitetura Geral](../docs/01-arquitetura-geral.md)
