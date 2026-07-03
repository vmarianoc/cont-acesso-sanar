package sync

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestEnviarEventos(t *testing.T) {
	var recebido eventosSyncRequest
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/edge/sync/eventos" {
			t.Fatalf("requisição inesperada: %s %s", r.Method, r.URL.Path)
		}
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Fatalf("header Authorization ausente ou incorreto: %q", r.Header.Get("Authorization"))
		}
		_ = json.NewDecoder(r.Body).Decode(&recebido)
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(eventosSyncResponse{Data: struct {
			Sincronizados int `json:"sincronizados"`
		}{Sincronizados: len(recebido.Eventos)}})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "test-token")
	pessoaID := "pessoa-1"
	foto := "https://example.com/foto.jpg"
	eventos := []Evento{
		{
			DispositivoID: "disp-1",
			PessoaID:      &pessoaID,
			Tipo:          "entrada",
			Resultado:     ResultadoLiberado,
			Metodo:        MetodoFacial,
			FotoURL:       &foto,
			OcorridoEm:    "2026-01-01T00:00:00.000Z",
		},
	}

	sincronizados, err := c.EnviarEventos(context.Background(), "tenant-1", "tenant_schema", eventos)
	if err != nil {
		t.Fatalf("EnviarEventos retornou erro: %v", err)
	}
	if sincronizados != 1 {
		t.Fatalf("esperava 1 sincronizado, obteve %d", sincronizados)
	}
	if recebido.TenantID != "tenant-1" || recebido.SchemaName != "tenant_schema" {
		t.Fatalf("payload recebido pelo servidor não bate: %+v", recebido)
	}
}

func TestHeartbeat(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body heartbeatRequest
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Status != StatusOnline {
			t.Fatalf("status inesperado: %q", body.Status)
		}
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(heartbeatResponse{Data: struct {
			Recebido   bool   `json:"recebido"`
			ServidorEm string `json:"servidor_em"`
		}{Recebido: true, ServidorEm: "2026-01-01T00:00:00.000Z"}})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "test-token")
	if err := c.Heartbeat(context.Background(), "disp-1", "tenant-1", "tenant_schema", "1.0.0", StatusOnline); err != nil {
		t.Fatalf("Heartbeat retornou erro: %v", err)
	}
}

func TestBuscarComandos(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("dispositivo_id") != "disp-1" {
			t.Fatalf("query param dispositivo_id ausente: %s", r.URL.RawQuery)
		}
		w.WriteHeader(http.StatusOK)
		_ = json.NewEncoder(w).Encode(comandosResponse{
			Data: []Comando{{ID: "cmd-1", DispositivoID: "disp-1", TipoComando: "cadastro.pessoa"}},
		})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "test-token")
	comandos, err := c.BuscarComandos(context.Background(), "disp-1", "tenant_schema")
	if err != nil {
		t.Fatalf("BuscarComandos retornou erro: %v", err)
	}
	if len(comandos) != 1 || comandos[0].ID != "cmd-1" {
		t.Fatalf("comandos inesperados: %+v", comandos)
	}
}

func TestErroDaCloudEDecodificadoComoAPIError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]any{
			"erro": map[string]string{"codigo": "NAO_AUTENTICADO", "mensagem": "Token inválido ou expirado"},
		})
	}))
	defer srv.Close()

	c := NewClient(srv.URL, "invalid")
	_, err := c.EnviarEventos(context.Background(), "t", "s", nil)
	apiErr, ok := err.(*APIError)
	if !ok {
		t.Fatalf("esperava *APIError, obteve %T: %v", err, err)
	}
	if apiErr.StatusCode != 401 || apiErr.Codigo != "NAO_AUTENTICADO" {
		t.Fatalf("APIError inesperado: %+v", apiErr)
	}
}
