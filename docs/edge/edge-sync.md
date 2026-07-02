# Edge Sync

## Visão geral

O Edge Sync é o protocolo de sincronização bidirecional entre o Edge Service (local) e a Cloud API. Garante consistência de dados sem exigir conectividade contínua, usando uma fila de mensagens tolerante a falhas e um modelo de comandos com confirmação.

## Modelo de dados distribuídos

A plataforma usa um modelo **eventual consistency** com papéis bem definidos:

| Fonte de verdade | Para quê |
|---|---|
| **Edge** | Eventos de acesso físico (quem entrou/saiu, quando, onde) |
| **Cloud** | Cadastros aprovados, comandos, licenças, notificações |

O Edge nunca inventa cadastros; a Cloud nunca inventa eventos de acesso. Conflitos são raros e tratados com prioridade para a Cloud (exceto em eventos físicos já consumados).

## Fluxo de sincronização

### Edge → Cloud (upload de eventos)

Eventos gerados no Edge (acessos, alarmes, visitantes registrados) são enfileirados em `sync_queue` e enviados em lotes para a Cloud:

```
Edge                              Cloud
 │                                  │
 ├─── POST /edge/sync/eventos ────► │
 │    [ {evento1}, {evento2}, ... ] │
 │                                  │
 │ ◄── { recebidos: [id1, id2] } ───┤
 │                                  │
 ├─── Marca como sincronizados ──►  │
```

**Políticas de envio:**
- Lote máximo: 500 eventos por requisição
- Intervalo normal: a cada 30 segundos
- Intervalo quando há backlog: a cada 5 segundos até a fila esvaziar
- Timeout da requisição: 10 segundos; em caso de falha, retentar com backoff exponencial

### Cloud → Edge (comandos)

A Cloud envia comandos para o Edge através de um modelo poll-based (Edge pergunta, Cloud responde):

```
Edge                              Cloud
 │                                  │
 ├─── GET /edge/sync/comandos ────► │
 │                                  │
 │ ◄── [ {cmd1}, {cmd2}, ... ] ─────┤
 │                                  │
 ├─── Executar comandos locais       │
 │                                  │
 ├─── POST /edge/sync/comandos/ack ► │
 │    [ {id: cmd1, ok: true}, ... ] │
```

**Intervalo de polling:** 60 segundos em condição normal; reduzido para 5 segundos se o heartbeat indicar comandos pendentes (`pending_commands > 0`).

## Heartbeat

O Edge envia um heartbeat a cada 60 segundos:

```http
POST /edge/sync/heartbeat
X-Edge-Token: ...

{
  "edge_id": "uuid",
  "versao": "2.4.1",
  "uptime_s": 86400,
  "sync_queue_size": 0,
  "ultima_sync_em": "2025-10-14T03:22:00Z",
  "hardware_status": {
    "hikvision": "online",
    "cameras": 8,
    "cameras_offline": 0
  },
  "disco_livre_gb": 48.2,
  "cpu_pct": 12,
  "ram_pct": 31
}
```

Resposta da Cloud:

```json
{
  "pending_commands": 3,
  "nova_versao_disponivel": "2.5.0",
  "timestamp_cloud": "2025-10-14T03:22:01Z"
}
```

A Cloud marca um Edge como **offline** se não receber heartbeat por mais de 3 minutos. Uma notificação push é enviada ao síndico.

## Tipos de comando (Cloud → Edge)

| Comando | Descrição | Criticidade |
|---|---|---|
| `cadastro.pessoa` | Criar ou atualizar cadastro de pessoa | Alta |
| `cadastro.veiculo` | Adicionar ou remover veículo autorizado | Alta |
| `biometria.sincronizar` | Enviar template biométrico para o hardware | Alta |
| `biometria.remover` | Remover biometria do hardware | Alta |
| `unidade.bloquear` | Bloquear acesso de todos da unidade | Crítica |
| `unidade.desbloquear` | Restaurar acesso da unidade | Alta |
| `pessoa.bloquear` | Bloquear pessoa específica | Crítica |
| `cartao.revogar` | Invalidar cartão RFID | Alta |
| `config.atualizar` | Atualizar parâmetros de configuração | Média |
| `servico.reiniciar` | Reiniciar Edge Service (com confirmação) | Baixa |
| `atualizacao.instalar` | Instalar nova versão do Edge | Baixa |

Comandos com criticidade **Crítica** são executados imediatamente e o resultado confirmado antes do próximo polling. Os demais podem aguardar o próximo ciclo.

## Tabela `sync_queue`

```sql
CREATE TABLE sync_queue (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo         TEXT NOT NULL,      -- 'evento' | 'heartbeat'
  payload      JSONB NOT NULL,
  tentativas   INT NOT NULL DEFAULT 0,
  proxima_tent TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sincronizado BOOLEAN NOT NULL DEFAULT FALSE,
  criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sync_queue_pendentes
  ON sync_queue (proxima_tent)
  WHERE sincronizado = FALSE;
```

**Retenção:** entradas sincronizadas são deletadas após 7 dias. Entradas não sincronizadas com mais de 90 dias são arquivadas e alertam o suporte.

## Conflitos de dados

Situação: o Edge cria um visitante offline e, ao sincronizar, a Cloud já tem um visitante com o mesmo nome/documento na mesma unidade no mesmo horário.

**Resolução**: a Cloud mantém ambos os registros com flag `conflito = TRUE` e notifica o síndico para resolução manual. O acesso físico que já ocorreu é preservado.

Outros conflitos (cadastro atualizado offline vs. aprovação na Cloud):
- Cloud tem prioridade para dados cadastrais (endereço, foto, biometria)
- Edge tem prioridade para eventos físicos (acesso ocorreu, não pode ser desfeito)

## Segurança da sincronização

- Toda comunicação usa TLS 1.3
- O Edge se autentica com mTLS (certificado por tenant) + token de API
- Cada lote de eventos inclui um `request_id` único para idempotência (reenvia seguro sem duplicar)
- A Cloud valida que os eventos pertencem ao tenant do Edge autenticado
- Payloads de biometria nunca trafegam pela API de sync (são enviados diretamente do hardware ao hardware pelo SDK do fabricante)

## Monitoramento da sincronização

No App Síndico, o painel de status do Edge mostra:

- Status de conexão (Online / Offline há X minutos)
- Tamanho da fila de sync pendente
- Última sincronização bem-sucedida
- Comandos pendentes de execução
- Versão instalada vs. versão disponível

## Documentação relacionada

- [Edge Service](edge-service.md)
- [Cloud API](../cloud/cloud-api.md)
- [Identidade Condominial](../database/identidade-condominial.md)
- [Módulo Portaria](../modules/portaria.md)
