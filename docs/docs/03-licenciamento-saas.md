# Licenciamento SaaS

## Planos disponíveis

| | START | PRO | ENTERPRISE |
|---|---|---|---|
| **Condomínios por licença** | 1 | 1 | Ilimitado (multi-tenant) |
| **Unidades** | até 50 | até 500 | Ilimitado |
| **Porteiros simultâneos** | 2 | 10 | Ilimitado |
| **Ramais SIP** | 2 | 10 | Configurável |
| **Câmeras** | 4 | 32 | Ilimitado |
| **App Morador** | ✓ | ✓ | ✓ |
| **App Síndico** | ✓ | ✓ | ✓ |
| **Chat Portaria** | ✓ | ✓ | ✓ |
| **Cadastro Inteligente (OCR/IA)** | — | ✓ | ✓ |
| **Fluxo de Aprovações** | Básico | Avançado | Customizável |
| **Integração Superlógica / Com21** | — | ✓ | ✓ |
| **API pública (webhooks)** | — | — | ✓ |
| **SLA de suporte** | 48h | 8h | 4h (SLA contratual) |
| **Relatórios e BI** | Básico | Intermediário | Avançado + exportação |

## Modelo de validação de licença

A licença é validada na nuvem no momento em que o Edge Service é iniciado e a cada **24 horas** durante a operação. O comportamento em cada cenário:

```
Startup do Edge Service
        │
        ▼
  Licença em cache?
   ├── Não ──► Consultar Cloud API
   │               ├── Sucesso ──► Salvar cache, iniciar normalmente
   │               └── Falha ───► Sem licença, modo degradado*
   └── Sim ──► Cache válido (< 30 dias)?
               ├── Sim ──► Iniciar normalmente
               └── Não ──► Tentar renovar na Cloud
                               ├── Sucesso ──► Renovar cache
                               └── Falha ───► Usar cache expirado, alertar admin
```

> **Importante**: o acesso físico ao condomínio **nunca é bloqueado** por falha de validação de licença. Em modo degradado, funções avançadas (OCR, relatórios, integrações) ficam indisponíveis, mas a catraca e o controle de acesso continuam operando.

O cache local tem validade de **30 dias**. Isso garante operação normal mesmo em condomínios com conectividade instável.

## Ciclo de vida da licença

### Ativação

1. Administradora adquire a licença no painel Cloud
2. Um `license_key` é gerado e vinculado ao CNPJ/CPF do condomínio
3. No primeiro startup do Edge Service, o operador informa o `license_key`
4. O Edge registra seu fingerprint (UUID de hardware) na Cloud
5. A licença fica vinculada a esse Edge; reativação em novo hardware requer aprovação

### Renovação

- Licenças anuais: renovadas 30 dias antes do vencimento com aviso no painel
- Licenças mensais: renovadas automaticamente via cobrança recorrente
- Em caso de inadimplência: 7 dias de carência antes do modo degradado

### Transferência e cancelamento

- Transferência entre tenants requer aprovação do suporte
- Cancelamento: dados ficam disponíveis para exportação por **60 dias** após o encerramento

## Cobrança e faturamento

- **START e PRO**: cobrança mensal ou anual (desconto de 15% no anual) via cartão ou boleto
- **ENTERPRISE**: contrato anual com nota fiscal, podendo incluir SLA customizado e suporte dedicado
- Faturamento via Stripe (cartão internacional) ou intermediador local (boleto bancário)

## Gestão multi-tenant (ENTERPRISE)

Administradoras de condomínio com plano Enterprise acessam um painel unificado onde podem:

- Criar e gerenciar múltiplos condomínios (tenants) em uma única conta
- Visualizar status de todos os Edges (online/offline, versão, última sync)
- Distribuir e revogar licenças por condomínio
- Acessar relatórios consolidados entre condomínios
- Configurar limites e políticas por condomínio filho

## Documentação relacionada

- [Visão Geral](00-visao-geral.md)
- [Cloud API](../cloud/cloud-api.md)
- [Multi-tenant](../database/multi-tenant.md)
