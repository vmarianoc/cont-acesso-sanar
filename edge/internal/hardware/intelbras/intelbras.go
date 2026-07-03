// Package intelbras seria o adapter para controladoras Intelbras (SDK +
// RS-485) — ver docs/edge/edge-service.md e docs/modules/migracao.md.
//
// Stub: a integração real depende do SDK/protocolo serial proprietário da
// Intelbras e não está incluída neste esqueleto.
package intelbras

import (
	"context"

	"github.com/condar/edge-service/internal/hardware"
)

type Config struct {
	Enabled  bool
	Host     string
	Port     int
	Username string
	Password string
}

type Adapter struct {
	cfg     Config
	eventos chan hardware.EventoAcesso
}

func New(cfg Config) *Adapter {
	return &Adapter{cfg: cfg, eventos: make(chan hardware.EventoAcesso)}
}

func (a *Adapter) Nome() string { return "intelbras" }

func (a *Adapter) Conectar(ctx context.Context) error {
	// TODO: abrir sessão com o SDK/porta serial da Intelbras e converter
	// eventos de acesso/alarme em hardware.EventoAcesso.
	return nil
}

func (a *Adapter) Desconectar() error {
	close(a.eventos)
	return nil
}

func (a *Adapter) Eventos() <-chan hardware.EventoAcesso {
	return a.eventos
}
