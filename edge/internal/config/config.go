// Package config carrega a configuração do Edge Service a partir de um
// arquivo YAML (config.yaml), com overrides opcionais via variáveis de
// ambiente para os campos mais sensíveis/operacionais.
package config

import (
	"fmt"
	"os"

	"gopkg.in/yaml.v3"
)

type AdapterConfig struct {
	Enabled  bool   `yaml:"enabled"`
	Host     string `yaml:"host"`
	Port     int    `yaml:"port"`
	Username string `yaml:"username"`
	Password string `yaml:"password"`
}

type DatabaseConfig struct {
	Path      string `yaml:"path"`
	MaxSizeGB int    `yaml:"max_size_gb"`
}

type HardwareConfig struct {
	Hikvision AdapterConfig `yaml:"hikvision"`
	Intelbras AdapterConfig `yaml:"intelbras"`
	OSDP      AdapterConfig `yaml:"osdp"`
}

type LocalAPIConfig struct {
	Port int    `yaml:"port"`
	Bind string `yaml:"bind"`
}

// SIPConfig configura a Central SIP (Flexisip) — ver docs/modules/central-sip.md.
type SIPConfig struct {
	Enabled bool `yaml:"enabled"`
	PortUDP int  `yaml:"port_udp"`
	PortTLS int  `yaml:"port_tls"`
}

type SyncConfig struct {
	IntervalNormalSeconds       int `yaml:"interval_normal_seconds"`
	IntervalBacklogSeconds      int `yaml:"interval_backlog_seconds"`
	HeartbeatIntervalSeconds    int `yaml:"heartbeat_interval_seconds"`
	ComandosPollIntervalSeconds int `yaml:"comandos_poll_interval_seconds"`
	BatchSize                   int `yaml:"batch_size"`
}

type Config struct {
	TenantID      string `yaml:"tenant_id"`
	SchemaName    string `yaml:"schema_name"`
	DispositivoID string `yaml:"dispositivo_id"`
	EdgeToken     string `yaml:"edge_token"`
	CloudAPIURL   string `yaml:"cloud_api_url"`
	LogLevel      string `yaml:"log_level"`

	Database DatabaseConfig `yaml:"database"`
	Hardware HardwareConfig `yaml:"hardware"`
	LocalAPI LocalAPIConfig `yaml:"local_api"`
	SIP      SIPConfig      `yaml:"sip"`
	Sync     SyncConfig     `yaml:"sync"`
}

func defaults() Config {
	return Config{
		CloudAPIURL: "http://localhost:3000",
		LogLevel:    "info",
		Database:    DatabaseConfig{Path: "./data/edge.db", MaxSizeGB: 8},
		LocalAPI:    LocalAPIConfig{Port: 8080, Bind: "0.0.0.0"},
		SIP:         SIPConfig{Enabled: false, PortUDP: 5060, PortTLS: 5061},
		Sync: SyncConfig{
			IntervalNormalSeconds:       30,
			IntervalBacklogSeconds:      5,
			HeartbeatIntervalSeconds:    60,
			ComandosPollIntervalSeconds: 60,
			BatchSize:                   500,
		},
	}
}

// Load lê o arquivo YAML em path, aplica defaults para campos ausentes e
// permite overrides pontuais via variáveis de ambiente (úteis em containers).
func Load(path string) (*Config, error) {
	cfg := defaults()

	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("ler arquivo de configuração %q: %w", path, err)
	}
	if err := yaml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parsear configuração %q: %w", path, err)
	}

	applyEnvOverrides(&cfg)

	if err := cfg.validate(); err != nil {
		return nil, err
	}
	return &cfg, nil
}

func applyEnvOverrides(cfg *Config) {
	if v := os.Getenv("EDGE_TOKEN"); v != "" {
		cfg.EdgeToken = v
	}
	if v := os.Getenv("CLOUD_API_URL"); v != "" {
		cfg.CloudAPIURL = v
	}
	if v := os.Getenv("EDGE_LOG_LEVEL"); v != "" {
		cfg.LogLevel = v
	}
}

func (c Config) validate() error {
	switch {
	case c.TenantID == "":
		return fmt.Errorf("config: tenant_id é obrigatório")
	case c.SchemaName == "":
		return fmt.Errorf("config: schema_name é obrigatório")
	case c.DispositivoID == "":
		return fmt.Errorf("config: dispositivo_id é obrigatório")
	case c.CloudAPIURL == "":
		return fmt.Errorf("config: cloud_api_url é obrigatório")
	}
	return nil
}
