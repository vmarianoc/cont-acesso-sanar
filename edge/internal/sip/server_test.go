package sip

import (
	"context"
	"testing"
)

func TestDesabilitadaNaoFazNada(t *testing.T) {
	s := New(Config{Enabled: false})
	if err := s.Iniciar(context.Background()); err != nil {
		t.Fatalf("Iniciar com sip desabilitado não deveria falhar: %v", err)
	}
	if err := s.Parar(); err != nil {
		t.Fatalf("Parar com sip desabilitado não deveria falhar: %v", err)
	}
}

func TestHabilitadaRetornaErroPorNaoEstarImplementada(t *testing.T) {
	s := New(Config{Enabled: true, PortUDP: 5060, PortTLS: 5061})
	if err := s.Iniciar(context.Background()); err == nil {
		t.Fatal("esperava erro: integração real com o Flexisip ainda não existe")
	}
	// Parar deve continuar seguro mesmo que Iniciar tenha falhado.
	if err := s.Parar(); err != nil {
		t.Fatalf("Parar não deveria falhar: %v", err)
	}
}
