# Cadastro Inteligente

## Visão geral

O Cadastro Inteligente automatiza a entrada de dados de moradores e veículos usando OCR (reconhecimento óptico de caracteres) combinado com modelos de IA para extração, validação e enriquecimento de informações. Reduz drasticamente o tempo de migração inicial e a carga de digitação na administradora.

Disponível a partir do plano **PRO**.

## Fontes de entrada suportadas

| Fonte | Formato | Extração |
|---|---|---|
| RG (frente e verso) | JPG, PNG, PDF | Nome, filiação, data de nascimento, RG, órgão emissor |
| CPF | JPG, PNG | Número do CPF |
| CNH | JPG, PNG | Nome, CPF, data de nascimento, validade, categoria |
| Contrato de locação | PDF | Nome, CPF, unidade, vigência do contrato |
| Planilha de moradores | XLS, XLSX, CSV | Todos os campos — mapeamento configurável |
| Export do Superlógica | JSON (API) | Unidades, moradores, responsáveis financeiros |
| Export da Com21 | JSON (API) | Unidades, moradores, responsáveis financeiros |
| PDF de lista de moradores | PDF | Nome, unidade, telefone (com confiança variável) |

## Fluxo de importação

### 1. Upload do documento ou planilha

O operador (administradora ou síndico) faz upload do arquivo no painel da Cloud API.

### 2. Extração por OCR + IA

Para documentos (RG, CNH, contratos):
- OCR via Tesseract (documentos simples) ou serviço de visão na nuvem (documentos complexos)
- Modelo de IA fine-tuned para documentos brasileiros interpreta os campos e resolve ambiguidades
- Campos extraídos com percentual de confiança (ex.: "CPF: 12345678900 — confiança: 98%")
- Campos com confiança < 80% são marcados para revisão manual

Para planilhas e CSVs:
- Parser detecta automaticamente o separador (`,` `;` `\t`)
- Interface de mapeamento de colunas: o operador arrasta os cabeçalhos da planilha para os campos do sistema
- Mapeamento salvo como template reutilizável para futuras importações do mesmo cliente

### 3. Validação automática

Antes de gravar, o sistema valida:

- **CPF**: dígito verificador
- **CNPJ**: dígito verificador (para empresas)
- **Placa de veículo**: formato Mercosul e antigo
- **Duplicatas**: mesmo CPF já cadastrado em outra unidade do mesmo condomínio → alerta, não bloqueia
- **Unidade existente**: a unidade informada precisa existir no cadastro de blocos/unidades
- **Formato de campos**: telefone, e-mail, CEP

### 4. Tela de revisão

Antes da importação final, o operador vê um resumo:

```
Importação — Lista de Moradores v3.xlsx
─────────────────────────────────────────────────────
  128 registros encontrados
   ✓ 114 prontos para importar
   ⚠  11 precisam de revisão (campos com baixa confiança)
   ✗   3 com erro (CPF inválido)

[Ver registros com problema]  [Importar 114 aprovados]
```

Cada registro com problema pode ser corrigido manualmente antes de incluir na importação.

### 5. Importação e aprovação

Após revisão, o operador confirma. Os registros entram como **solicitações pendentes de aprovação** do síndico (respeitando o Fluxo de Aprovações), exceto se o operador tiver permissão de importação direta (perfil Administradora Enterprise).

## Foto de moradores

O sistema aceita importação em lote de fotos:

- ZIP com fotos nomeadas por CPF ou número de unidade (`12345678900.jpg` ou `apto-201.jpg`)
- Fotos são automaticamente associadas ao registro correspondente
- Validação de qualidade: resolução mínima, rosto detectável (para uso em biometria facial)

## Extração de veículos

Ao fotografar a placa de um veículo:
- OCR lê a placa (formatos Mercosul e antigo)
- Sistema consulta base de dados pública (quando disponível) para sugerir modelo/cor
- Operador confirma ou corrige antes de salvar

## Histórico de importações

Cada importação gera um registro com:
- Data, operador responsável, arquivo origem
- Quantidade de registros processados, aprovados, com erro
- Log detalhado de cada registro para auditoria
- Possibilidade de reverter uma importação inteira (soft delete em lote)

## Documentação relacionada

- [Fluxo de Aprovações](fluxo-aprovacoes.md)
- [Migração](migracao.md)
- [Arquitetura Geral](../docs/01-arquitetura-geral.md)
- [LGPD e Segurança](../docs/02-lgpd-e-seguranca.md)
