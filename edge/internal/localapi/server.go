// Package localapi expõe a API HTTP local (rede do condomínio) usada pelo
// painel da portaria, conforme docs/edge/edge-service.md ("API local").
//
// Este esqueleto só inclui /health; servir o painel React (apps/web-portaria)
// como estáticos, a API REST completa da portaria e o WebSocket de eventos em
// tempo real ficam para uma próxima iteração — hoje o Edge só sincroniza com
// a Cloud (pacote internal/sync), sem cache local de eventos para servir aqui.
package localapi

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"
)

// StatusProvider informa o estado atual do Core Engine para health checks.
type StatusProvider interface {
	FilaSyncPendente() int
}

func New(bind string, port int, status StatusProvider, logger *slog.Logger) *http.Server {
	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]any{
			"status":             "ok",
			"fila_sync_pendente": status.FilaSyncPendente(),
			"servidor_em":        time.Now().UTC().Format(time.RFC3339),
		})
	})

	handler := requestLogger(logger, mux)

	return &http.Server{
		Addr:              fmt.Sprintf("%s:%d", bind, port),
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}
}

func requestLogger(logger *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		next.ServeHTTP(w, r)
		logger.Debug("requisição local", "method", r.Method, "path", r.URL.Path, "duracao_ms", time.Since(start).Milliseconds())
	})
}
