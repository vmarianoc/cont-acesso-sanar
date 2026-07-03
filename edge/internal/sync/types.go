// Package sync implementa o cliente HTTP do protocolo Edge Sync (ver
// docs/edge/edge-sync.md no repositório da Cloud API) e uma fila local de
// eventos pendentes de envio.
//
// Os tipos aqui espelham exatamente os schemas Zod validados hoje pela
// Cloud API (apps/api/src/routes/edgeSync.ts e edgeLicense.ts) — não a
// versão mais rica descrita na doc de arquitetura (ex.: o heartbeat real é
// bem mais simples do que o exemplo em edge-sync.md). Ver README.md deste
// módulo para os gaps conhecidos entre a doc e o que a Cloud expõe hoje.
package sync

import "encoding/json"

// Resultado de um evento de acesso, conforme aceito por POST /edge/sync/eventos.
type Resultado string

const (
	ResultadoLiberado Resultado = "liberado"
	ResultadoNegado   Resultado = "negado"
	ResultadoErro     Resultado = "erro"
)

// Método de identificação usado no acesso.
type Metodo string

const (
	MetodoFacial    Metodo = "facial"
	MetodoQRCode    Metodo = "qrcode"
	MetodoBiometria Metodo = "biometria"
	MetodoManual    Metodo = "manual"
)

// Evento é um único registro de acesso a ser enviado à Cloud.
type Evento struct {
	DispositivoID string    `json:"dispositivo_id"`
	PessoaID      *string   `json:"pessoa_id,omitempty"`
	Tipo          string    `json:"tipo"`
	Resultado     Resultado `json:"resultado"`
	Metodo        Metodo    `json:"metodo"`
	FotoURL       *string   `json:"foto_url,omitempty"`
	OcorridoEm    string    `json:"ocorrido_em"` // RFC3339
}

type eventosSyncRequest struct {
	TenantID   string   `json:"tenant_id"`
	SchemaName string   `json:"schema_name"`
	Eventos    []Evento `json:"eventos"`
}

type eventosSyncResponse struct {
	Data struct {
		Sincronizados int `json:"sincronizados"`
	} `json:"data"`
}

// StatusDispositivo é o valor aceito hoje por POST /edge/sync/heartbeat.
// A doc de arquitetura descreve um payload bem mais rico (uptime, cpu, ram,
// hardware_status...) que a Cloud ainda não implementa — só os campos abaixo
// são de fato aceitos pelo endpoint atual.
type StatusDispositivo string

const (
	StatusOnline    StatusDispositivo = "online"
	StatusDegradado StatusDispositivo = "degradado"
)

type heartbeatRequest struct {
	DispositivoID string            `json:"dispositivo_id"`
	TenantID      string            `json:"tenant_id"`
	SchemaName    string            `json:"schema_name"`
	VersaoFw      string            `json:"versao_fw,omitempty"`
	Status        StatusDispositivo `json:"status"`
}

type heartbeatResponse struct {
	Data struct {
		Recebido   bool   `json:"recebido"`
		ServidorEm string `json:"servidor_em"`
	} `json:"data"`
}

// Comando é uma linha da tabela sync_queue retornada por GET /edge/sync/comandos.
type Comando struct {
	ID                string          `json:"id"`
	DispositivoID     string          `json:"dispositivo_id"`
	TipoComando       string          `json:"tipo_comando"`
	Payload           json.RawMessage `json:"payload"`
	Executado         bool            `json:"executado"`
	ExecutadoEm       *string         `json:"executado_em"`
	UltimoHeartbeat   *string         `json:"ultimo_heartbeat"`
	StatusDispositivo *string         `json:"status_dispositivo"`
	VersaoFw          *string         `json:"versao_fw"`
	Tentativas        int             `json:"tentativas"`
	CriadoEm          string          `json:"criado_em"`
}

type comandosResponse struct {
	Data []Comando `json:"data"`
}

// ValidarLicencaRequest é o corpo aceito por POST /edge/validate-license.
type ValidarLicencaRequest struct {
	LicenseKey  string `json:"license_key"`
	Fingerprint string `json:"fingerprint,omitempty"`
}

// LicencaValidada é a resposta de /edge/validate-license quando a licença é
// encontrada (o Edge nunca deve bloquear o acesso físico com base nela —
// Degradado indica que a licença está inativa/expirada, mas o hardware deve
// continuar operando localmente).
type LicencaValidada struct {
	Valida    bool   `json:"valida"`
	Degradado bool   `json:"degradado"`
	TenantID  string `json:"tenant_id"`
	Plano     string `json:"plano"`
	Limites   struct {
		Unidades     *int `json:"unidades"`
		Dispositivos *int `json:"dispositivos"`
	} `json:"limites"`
	Validade *string `json:"validade"`
	Ativa    bool    `json:"ativa"`
	Expirada bool    `json:"expirada"`
}

type validarLicencaResponse struct {
	Data LicencaValidada `json:"data"`
}

// erroResponse é o formato padrão de erro da Cloud API: { erro: { codigo, mensagem } }.
type erroResponse struct {
	Erro struct {
		Codigo   string `json:"codigo"`
		Mensagem string `json:"mensagem"`
	} `json:"erro"`
}
