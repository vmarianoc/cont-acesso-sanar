// Package sip gerencia a Central SIP embarcada no Edge Service — ver
// docs/modules/central-sip.md e o diagrama de componentes em
// docs/edge/edge-service.md (Flexisip roda como parte do Edge, ao lado do
// Core Engine e da API local).
//
// O Flexisip (Belledonne Communications) é um processo/binário próprio, não
// uma biblioteca Go — a integração real aqui seria por processo (gerar
// flexisip.conf a partir da config do Edge, subir o binário como subprocesso
// supervisionado, e falar com sua API de administração para provisionar
// ramais) ou por um proxy SIP embutido em Go, se optarem por não depender do
// binário do Flexisip. Nenhuma das duas está implementada neste esqueleto.
package sip

import (
	"context"
	"fmt"
)

type Config struct {
	Enabled bool
	PortUDP int
	PortTLS int
}

// Server representa o ciclo de vida da Central SIP dentro do Edge. Hoje é um
// stub: Iniciar/Parar não sobem nenhum processo SIP de verdade.
type Server struct {
	cfg Config
}

func New(cfg Config) *Server {
	return &Server{cfg: cfg}
}

// Iniciar sobe a Central SIP. No-op quando desabilitada na configuração.
func (s *Server) Iniciar(ctx context.Context) error {
	if !s.cfg.Enabled {
		return nil
	}
	// TODO: gerar a configuração do Flexisip (ramais por unidade, ramal fixo
	// da portaria, TURN/STUN para chamadas fora da LAN — ver
	// docs/modules/central-sip.md) e subir o processo escutando em
	// s.cfg.PortUDP (SIP) e s.cfg.PortTLS (SIP sobre TLS).
	return fmt.Errorf("sip: Central SIP habilitada na config, mas a integração com o Flexisip ainda não está implementada")
}

// Parar encerra a Central SIP, se estiver rodando.
func (s *Server) Parar() error {
	if !s.cfg.Enabled {
		return nil
	}
	// TODO: encerrar o processo/subprocesso do Flexisip com graceful shutdown
	// (drenar chamadas em curso antes de matar o processo).
	return nil
}
