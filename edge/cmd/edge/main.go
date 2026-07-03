// Comando edge é o ponto de entrada do Edge Service (appliance Linux, Go).
// Ver docs/edge/edge-service.md para a arquitetura completa.
package main

import (
	"context"
	"flag"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/condar/edge-service/internal/config"
	"github.com/condar/edge-service/internal/core"
	"github.com/condar/edge-service/internal/logging"
)

func main() {
	configPath := flag.String("config", "config.yaml", "caminho do arquivo de configuração")
	flag.Parse()

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("carregar configuração: %v", err)
	}

	logger := logging.New(cfg.LogLevel)
	logger.Info("iniciando edge service",
		"tenant_id", cfg.TenantID,
		"dispositivo_id", cfg.DispositivoID,
		"cloud_api_url", cfg.CloudAPIURL,
	)

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	engine := core.NewEngine(cfg, logger)
	if err := engine.Run(ctx); err != nil {
		logger.Error("edge service encerrado com erro", "err", err)
		os.Exit(1)
	}
	logger.Info("edge service encerrado")
}
