package sync

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// APIError representa um erro retornado pela Cloud API no formato padrão
// { erro: { codigo, mensagem } }.
type APIError struct {
	StatusCode int
	Codigo     string
	Mensagem   string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("cloud api [%d] %s: %s", e.StatusCode, e.Codigo, e.Mensagem)
}

// Client fala com os endpoints /edge/* da Cloud API.
type Client struct {
	baseURL    string
	edgeToken  string
	httpClient *http.Client
}

func NewClient(baseURL, edgeToken string) *Client {
	return &Client{
		baseURL:   baseURL,
		edgeToken: edgeToken,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

func (c *Client) doJSON(ctx context.Context, method, path string, body any, out any) error {
	var reqBody io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("serializar corpo da requisição: %w", err)
		}
		reqBody = bytes.NewReader(b)
	}

	pathPart, queryPart, _ := strings.Cut(path, "?")
	u, err := url.JoinPath(c.baseURL, pathPart)
	if err != nil {
		return fmt.Errorf("montar URL: %w", err)
	}
	if queryPart != "" {
		u += "?" + queryPart
	}

	req, err := http.NewRequestWithContext(ctx, method, u, reqBody)
	if err != nil {
		return fmt.Errorf("montar requisição: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.edgeToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.edgeToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("chamar %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	respBody, err := io.ReadAll(resp.Body)
	if err != nil {
		return fmt.Errorf("ler resposta de %s %s: %w", method, path, err)
	}

	if resp.StatusCode >= 400 {
		var erro erroResponse
		_ = json.Unmarshal(respBody, &erro)
		return &APIError{StatusCode: resp.StatusCode, Codigo: erro.Erro.Codigo, Mensagem: erro.Erro.Mensagem}
	}

	if out != nil && len(respBody) > 0 {
		if err := json.Unmarshal(respBody, out); err != nil {
			return fmt.Errorf("parsear resposta de %s %s: %w", method, path, err)
		}
	}
	return nil
}

// EnviarEventos envia um lote de eventos de acesso (POST /edge/sync/eventos).
func (c *Client) EnviarEventos(ctx context.Context, tenantID, schemaName string, eventos []Evento) (sincronizados int, err error) {
	var resp eventosSyncResponse
	req := eventosSyncRequest{TenantID: tenantID, SchemaName: schemaName, Eventos: eventos}
	if err := c.doJSON(ctx, http.MethodPost, "/edge/sync/eventos", req, &resp); err != nil {
		return 0, err
	}
	return resp.Data.Sincronizados, nil
}

// Heartbeat informa que o Edge está ativo (POST /edge/sync/heartbeat).
func (c *Client) Heartbeat(ctx context.Context, dispositivoID, tenantID, schemaName, versaoFw string, status StatusDispositivo) error {
	req := heartbeatRequest{
		DispositivoID: dispositivoID,
		TenantID:      tenantID,
		SchemaName:    schemaName,
		VersaoFw:      versaoFw,
		Status:        status,
	}
	var resp heartbeatResponse
	return c.doJSON(ctx, http.MethodPost, "/edge/sync/heartbeat", req, &resp)
}

// BuscarComandos lista comandos pendentes para o dispositivo (GET /edge/sync/comandos).
func (c *Client) BuscarComandos(ctx context.Context, dispositivoID, schemaName string) ([]Comando, error) {
	path := fmt.Sprintf(
		"/edge/sync/comandos?dispositivo_id=%s&schema_name=%s",
		url.QueryEscape(dispositivoID), url.QueryEscape(schemaName),
	)
	var resp comandosResponse
	if err := c.doJSON(ctx, http.MethodGet, path, nil, &resp); err != nil {
		return nil, err
	}
	return resp.Data, nil
}

// ConfirmarComando marcaria um comando como executado.
//
// GAP CONHECIDO: a Cloud API documenta POST /edge/sync/comandos/:id/ack
// (docs/edge/edge-sync.md), mas esse endpoint ainda não está implementado em
// apps/api/src/routes/edgeSync.ts — hoje só existe o GET de listagem. Este
// método fica como placeholder até o endpoint existir no lado Cloud.
func (c *Client) ConfirmarComando(ctx context.Context, comandoID string, ok bool) error {
	return fmt.Errorf("ConfirmarComando: endpoint POST /edge/sync/comandos/%s/ack ainda não existe na Cloud API", comandoID)
}

// ValidarLicenca valida a licença do tenant pelo hardware (POST /edge/validate-license).
// Não bloqueia acesso físico em caso de licença degradada — o chamador decide.
func (c *Client) ValidarLicenca(ctx context.Context, licenseKey, fingerprint string) (*LicencaValidada, error) {
	req := ValidarLicencaRequest{LicenseKey: licenseKey, Fingerprint: fingerprint}
	var resp validarLicencaResponse
	if err := c.doJSON(ctx, http.MethodPost, "/edge/validate-license", req, &resp); err != nil {
		return nil, err
	}
	return &resp.Data, nil
}
