# Migração

## Visão geral

O módulo de Migração importa bases de controle de acesso existentes para a plataforma, mantendo o histórico de acessos, cadastros de moradores e configurações de hardware. O objetivo é que o condomínio passe da solução anterior para a nova plataforma **sem redigitar dados** e com o mínimo de downtime possível.

## Sistemas suportados

### Hikvision (iVMS-4200 / MinMoe)

Importação via SDK da Hikvision e/ou exportação do banco de dados local:

| Dado | Importado | Observações |
|---|---|---|
| Cadastro de pessoas | ✓ | Nome, foto, departamento mapeado para unidade |
| Biometria facial | ✓ | Template biométrico re-enviado ao hardware novo |
| Cartões RFID | ✓ | Código do cartão preservado |
| Grupos de acesso | ✓ | Mapeados para perfis da plataforma |
| Histórico de eventos | ✓ | Últimos 90 dias (limitação do iVMS) |
| Configuração de câmeras | Parcial | IPs e canais importados; regras de gravação não |

### Intelbras (iSentri / Stand-alone)

Importação via RS-485, SDK proprietário ou exportação CSV do software:

| Dado | Importado | Observações |
|---|---|---|
| Cadastro de pessoas | ✓ | Nome, ID |
| Biometria digital | ✓ | Template ISO 19794-2 re-enviado |
| Cartões RFID | ✓ | |
| Histórico de eventos | Parcial | Depende do modelo e versão do firmware |
| Zonas de acesso | ✓ | Mapeadas para pontos de acesso da plataforma |

### Outros sistemas

Para sistemas não listados, o fluxo de importação via planilha é a alternativa:

- Exportar do sistema legado para CSV/XLS
- Usar o [Cadastro Inteligente](cadastro-inteligente.md) para mapeamento e importação
- Biometrias não compatíveis precisam ser recadastradas (instruções em lote para moradores)

## Processo de migração

### Fase 1 — Levantamento (1–2 dias)

1. Inventário de hardware existente (modelos de catracas, câmeras, leitoras)
2. Acesso ao sistema legado para extração de dados
3. Estimativa de volume: número de pessoas, veículos, cartões, eventos
4. Identificação de dados faltantes (ex.: fotos ausentes no sistema legado)
5. Definição de mapeamentos: departamentos → blocos/unidades, grupos → perfis

### Fase 2 — Importação de dados (1–3 dias)

1. Extrair dados do sistema legado (export ou API)
2. Executar ferramenta de migração em modo **dry-run** (sem gravar nada)
3. Revisar relatório de dry-run: erros, avisos, mapeamentos não resolvidos
4. Ajustar mapeamentos e executar importação real
5. Aprovar registros em lote no App Síndico (importação direta com perfil Admin)

### Fase 3 — Convivência paralela (1–7 dias)

Durante este período, ambos os sistemas rodam simultaneamente:
- Hardware novo configurado com os dados migrados
- Hardware antigo mantido como fallback
- Portaria trabalha com os dois painéis abertos
- Erros detectados são corrigidos na plataforma nova

### Fase 4 — Cutover

1. Data e hora definidas com o condomínio (preferencialmente madrugada ou fim de semana)
2. Sistema legado desativado
3. Hardware reconfigurado para se comunicar exclusivamente com o Edge Service novo
4. Portaria treinada e operando 100% na nova plataforma

### Fase 5 — Pós-migração (30 dias)

- Monitoramento de erros de acesso (acessos negados inesperados)
- Canal de suporte prioritário para o condomínio
- Relatório de completude: moradores com cadastro incompleto, biometrias pendentes
- Campanha de atualização para moradores instalarem o App Morador

## Ferramenta de migração (CLI)

O processo técnico usa uma CLI executada no servidor Edge:

```bash
# Dry-run: analisa sem gravar
access-migrate --source hikvision --config migration.yaml --dry-run

# Importação real
access-migrate --source hikvision --config migration.yaml --execute

# Relatório de status
access-migrate --report
```

`migration.yaml` contém as credenciais do sistema legado e os mapeamentos de departamentos para unidades.

## Rollback

Se a migração precisar ser desfeita:
- Soft delete em lote dos registros importados (reversível)
- Hardware reconfigurado para o sistema legado
- O histórico de eventos importados é preservado mesmo após rollback

## Recadastro de biometria

Quando a biometria do sistema legado é incompatível (formatos proprietários sem exportação):

1. O sistema gera uma lista de moradores sem biometria
2. Síndico define um período de recadastro (ex.: 30 dias)
3. Moradores recebem notificação pelo App para comparecer à portaria
4. Porteiro coleta biometria no novo hardware
5. Acesso por cartão ou QR code fica ativo como fallback durante o período

## Documentação relacionada

- [Cadastro Inteligente](cadastro-inteligente.md)
- [Edge Service](../edge/edge-service.md)
- [Identidade Condominial](../database/identidade-condominial.md)
- [Roadmap — Fase 1](../roadmap/fase-1.md)
