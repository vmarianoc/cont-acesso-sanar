// Package hardware define o contrato comum entre o Core Engine e os
// diferentes fabricantes de controladoras de acesso (Hikvision, Intelbras,
// OSDP v2, câmeras genéricas), conforme docs/edge/edge-service.md.
package hardware

import (
	"context"
	"time"
)

// EventoAcesso é a representação, já normalizada, de uma leitura no
// controlador físico — independente do fabricante.
type EventoAcesso struct {
	PessoaID   string // vazio quando o controlador não identifica a pessoa (ex.: QR desconhecido)
	Resultado  string // "liberado" | "negado" | "erro"
	Metodo     string // "facial" | "qrcode" | "biometria" | "manual"
	FotoURL    string // opcional; vazio quando o adapter não captura foto do evento
	OcorridoEm time.Time
}

// Adapter é implementado por cada integração de hardware. Conectar deve ser
// não-bloqueante: erros de conexão devem ser reportados via log e retentados
// internamente pelo adapter, nunca travando o Core Engine (o acesso físico
// não pode ficar refém da disponibilidade da Cloud nem do Core Engine).
type Adapter interface {
	// Nome identifica o adapter nos logs (ex.: "hikvision").
	Nome() string

	// Conectar inicializa a comunicação com o hardware. Deve retornar
	// rapidamente; reconexões automáticas ficam a cargo do próprio adapter.
	Conectar(ctx context.Context) error

	// Desconectar libera os recursos do adapter e fecha o canal de Eventos.
	Desconectar() error

	// Eventos entrega os eventos de acesso capturados pelo hardware. O canal
	// é fechado quando Desconectar é chamado.
	Eventos() <-chan EventoAcesso
}
