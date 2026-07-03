// Package logging configura o logger estruturado (JSON) do Edge Service,
// conforme docs/edge/edge-service.md ("Monitoramento e logs").
package logging

import (
	"log/slog"
	"os"
)

// New cria um logger JSON estruturado no nível informado
// ("debug" | "info" | "warn" | "error"; padrão "info" para valores inválidos).
func New(level string) *slog.Logger {
	handler := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: parseLevel(level)})
	return slog.New(handler)
}

func parseLevel(level string) slog.Level {
	switch level {
	case "debug":
		return slog.LevelDebug
	case "warn":
		return slog.LevelWarn
	case "error":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
