// Package osdp seria o adapter para leitoras compatíveis com o protocolo
// aberto OSDP v2 (RS-485) — ver docs/edge/edge-service.md.
//
// Stub: diferente da Hikvision/Intelbras, o OSDP é um protocolo aberto (sem
// SDK proprietário), então este adapter é o candidato mais viável para uma
// implementação real completa neste esqueleto — falta apenas a camada
// serial/framing OSDP.
package osdp

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

func (a *Adapter) Nome() string { return "osdp" }

func (a *Adapter) Conectar(ctx context.Context) error {
	// TODO: abrir a porta serial RS-485, implementar o framing OSDP v2
	// (poll/ack) e converter eventos de leitura em hardware.EventoAcesso.
	return nil
}

func (a *Adapter) Desconectar() error {
	close(a.eventos)
	return nil
}

func (a *Adapter) Eventos() <-chan hardware.EventoAcesso {
	return a.eventos
}
