package config

import (
	"os"
	"path/filepath"
	"testing"
)

func writeTempConfig(t *testing.T, content string) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.yaml")
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		t.Fatalf("escrever config temporária: %v", err)
	}
	return path
}

func TestLoadAplicaDefaults(t *testing.T) {
	path := writeTempConfig(t, `
tenant_id: "tenant-1"
schema_name: "tenant_1"
dispositivo_id: "disp-1"
`)
	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load retornou erro: %v", err)
	}
	if cfg.CloudAPIURL != "http://localhost:3000" {
		t.Errorf("cloud_api_url default incorreto: %q", cfg.CloudAPIURL)
	}
	if cfg.LocalAPI.Port != 8080 {
		t.Errorf("local_api.port default incorreto: %d", cfg.LocalAPI.Port)
	}
	if cfg.Sync.HeartbeatIntervalSeconds != 60 {
		t.Errorf("sync.heartbeat_interval_seconds default incorreto: %d", cfg.Sync.HeartbeatIntervalSeconds)
	}
}

func TestLoadValidaCamposObrigatorios(t *testing.T) {
	path := writeTempConfig(t, `cloud_api_url: "http://localhost:3000"`)
	if _, err := Load(path); err == nil {
		t.Fatal("esperava erro por falta de tenant_id/schema_name/dispositivo_id")
	}
}

func TestLoadArquivoInexistente(t *testing.T) {
	if _, err := Load("/caminho/que/nao/existe.yaml"); err == nil {
		t.Fatal("esperava erro ao carregar arquivo inexistente")
	}
}

func TestLoadOverrideViaVariavelDeAmbiente(t *testing.T) {
	path := writeTempConfig(t, `
tenant_id: "tenant-1"
schema_name: "tenant_1"
dispositivo_id: "disp-1"
edge_token: "do-arquivo"
`)
	t.Setenv("EDGE_TOKEN", "da-variavel-de-ambiente")

	cfg, err := Load(path)
	if err != nil {
		t.Fatalf("Load retornou erro: %v", err)
	}
	if cfg.EdgeToken != "da-variavel-de-ambiente" {
		t.Errorf("esperava override via EDGE_TOKEN, obteve %q", cfg.EdgeToken)
	}
}
