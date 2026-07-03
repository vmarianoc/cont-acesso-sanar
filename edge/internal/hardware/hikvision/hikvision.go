// Package hikvision seria o adapter para controladoras Hikvision via SDK
// MinMoe (TCP) — ver docs/edge/edge-service.md, tabela "Hardware Adapters".
//
// Este arquivo é um stub: a integração real depende do SDK proprietário da
// Hikvision (biblioteca nativa, geralmente distribuída só para Windows/Linux
// x86 com licenciamento do fabricante) e não está incluída neste esqueleto.
package hikvision

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

func (a *Adapter) Nome() string { return "hikvision" }

func (a *Adapter) Conectar(ctx context.Context) error {
	// TODO: abrir sessão com o SDK MinMoe (host:port + usuário/senha) e
	// registrar o callback de eventos (acesso, alarme, anti-passback),
	// convertendo cada notificação do SDK em um hardware.EventoAcesso e
	// publicando em a.eventos.
	return nil
}

func (a *Adapter) Desconectar() error {
	close(a.eventos)
	return nil
}

func (a *Adapter) Eventos() <-chan hardware.EventoAcesso {
	return a.eventos
}
