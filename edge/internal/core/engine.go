// Package core implementa o Core Engine do Edge Service: liga os adapters de
// hardware, a fila local e o cliente de sincronização com a Cloud, conforme
// o diagrama de componentes em docs/edge/edge-service.md.
package core

import (
	"context"
	"log/slog"
	stdsync "sync"
	"time"

	"github.com/condar/edge-service/internal/config"
	"github.com/condar/edge-service/internal/hardware"
	"github.com/condar/edge-service/internal/hardware/hikvision"
	"github.com/condar/edge-service/internal/hardware/intelbras"
	"github.com/condar/edge-service/internal/hardware/osdp"
	"github.com/condar/edge-service/internal/localapi"
	"github.com/condar/edge-service/internal/sip"
	edgesync "github.com/condar/edge-service/internal/sync"
)

// versao identifica este build nas chamadas de heartbeat (versao_fw).
const versao = "0.1.0-scaffold"

type Engine struct {
	cfg      *config.Config
	logger   *slog.Logger
	client   *edgesync.Client
	queue    *edgesync.Queue
	adapters []hardware.Adapter
	sip      *sip.Server
}

func NewEngine(cfg *config.Config, logger *slog.Logger) *Engine {
	adapters := buildAdapters(cfg.Hardware)
	return &Engine{
		cfg:      cfg,
		logger:   logger,
		client:   edgesync.NewClient(cfg.CloudAPIURL, cfg.EdgeToken),
		queue:    edgesync.NewQueue(),
		adapters: adapters,
		sip:      sip.New(sip.Config(cfg.SIP)),
	}
}

func buildAdapters(cfg config.HardwareConfig) []hardware.Adapter {
	var adapters []hardware.Adapter
	if cfg.Hikvision.Enabled {
		adapters = append(adapters, hikvision.New(hikvision.Config(cfg.Hikvision)))
	}
	if cfg.Intelbras.Enabled {
		adapters = append(adapters, intelbras.New(intelbras.Config(cfg.Intelbras)))
	}
	if cfg.OSDP.Enabled {
		adapters = append(adapters, osdp.New(osdp.Config(cfg.OSDP)))
	}
	return adapters
}

// FilaSyncPendente implementa localapi.StatusProvider.
func (e *Engine) FilaSyncPendente() int { return e.queue.Len() }

// Run inicializa adapters, API local e os laços de sincronização, bloqueando
// até que ctx seja cancelado (ex.: SIGINT/SIGTERM), quando encerra tudo.
func (e *Engine) Run(ctx context.Context) error {
	// runCtx é derivado de ctx mas também é cancelado explicitamente se a API
	// local falhar ao subir — sem isso, os laços de sync (que só observam
	// ctx.Done()) nunca parariam nesse caminho de erro, travando o processo.
	runCtx, cancelRun := context.WithCancel(ctx)
	defer cancelRun()

	for _, a := range e.adapters {
		if err := a.Conectar(ctx); err != nil {
			e.logger.Error("falha ao conectar adapter de hardware", "adapter", a.Nome(), "err", err)
		} else {
			e.logger.Info("adapter de hardware conectado", "adapter", a.Nome())
		}
	}

	// Central SIP: falha ao iniciar não deve derrubar o Edge — o controle de
	// acesso físico não pode ficar refém da Central SIP (mesma filosofia de
	// "modo degradado" já usada na validação de licença).
	if err := e.sip.Iniciar(ctx); err != nil {
		e.logger.Warn("central sip não iniciada", "err", err)
	}

	srv := localapi.New(e.cfg.LocalAPI.Bind, e.cfg.LocalAPI.Port, e, e.logger)
	srvErr := make(chan error, 1)
	go func() {
		e.logger.Info("api local iniciada", "addr", srv.Addr)
		if err := srv.ListenAndServe(); err != nil {
			srvErr <- err
		}
	}()

	var wg stdsync.WaitGroup
	for _, loop := range []func(context.Context){
		e.consumirEventosDosAdapters,
		e.loopHeartbeat,
		e.loopEnvioEventos,
		e.loopComandos,
	} {
		wg.Add(1)
		go func(loop func(context.Context)) {
			defer wg.Done()
			loop(runCtx)
		}(loop)
	}

	select {
	case <-ctx.Done():
		e.logger.Info("encerrando edge service...")
	case err := <-srvErr:
		e.logger.Error("api local encerrou com erro", "err", err)
	}
	cancelRun()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)

	if err := e.sip.Parar(); err != nil {
		e.logger.Warn("falha ao parar central sip", "err", err)
	}

	for _, a := range e.adapters {
		_ = a.Desconectar()
	}

	wg.Wait()
	return nil
}

func (e *Engine) consumirEventosDosAdapters(ctx context.Context) {
	var wg stdsync.WaitGroup
	for _, a := range e.adapters {
		wg.Add(1)
		go func(a hardware.Adapter) {
			defer wg.Done()
			for {
				select {
				case ev, ok := <-a.Eventos():
					if !ok {
						return
					}
					e.queue.Push(converterEvento(e.cfg.DispositivoID, ev))
				case <-ctx.Done():
					return
				}
			}
		}(a)
	}
	wg.Wait()
}

func converterEvento(dispositivoID string, ev hardware.EventoAcesso) edgesync.Evento {
	out := edgesync.Evento{
		DispositivoID: dispositivoID,
		Tipo:          "acesso",
		Resultado:     edgesync.Resultado(ev.Resultado),
		Metodo:        edgesync.Metodo(ev.Metodo),
		OcorridoEm:    ev.OcorridoEm.UTC().Format(time.RFC3339),
	}
	if ev.PessoaID != "" {
		out.PessoaID = &ev.PessoaID
	}
	if ev.FotoURL != "" {
		out.FotoURL = &ev.FotoURL
	}
	return out
}

func (e *Engine) loopHeartbeat(ctx context.Context) {
	interval := time.Duration(e.cfg.Sync.HeartbeatIntervalSeconds) * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			err := e.client.Heartbeat(ctx, e.cfg.DispositivoID, e.cfg.TenantID, e.cfg.SchemaName, versao, edgesync.StatusOnline)
			if err != nil {
				e.logger.Warn("falha no heartbeat", "err", err)
			}
		case <-ctx.Done():
			return
		}
	}
}

func (e *Engine) loopEnvioEventos(ctx context.Context) {
	for {
		interval := time.Duration(e.cfg.Sync.IntervalNormalSeconds) * time.Second
		if e.queue.Len() > 0 {
			interval = time.Duration(e.cfg.Sync.IntervalBacklogSeconds) * time.Second
		}
		select {
		case <-time.After(interval):
			e.enviarLoteEventos(ctx)
		case <-ctx.Done():
			return
		}
	}
}

func (e *Engine) enviarLoteEventos(ctx context.Context) {
	if e.queue.Len() == 0 {
		return
	}
	lote := e.queue.DrainBatch(e.cfg.Sync.BatchSize)
	sincronizados, err := e.client.EnviarEventos(ctx, e.cfg.TenantID, e.cfg.SchemaName, lote)
	if err != nil {
		e.logger.Warn("falha ao enviar eventos, devolvendo à fila", "err", err, "quantidade", len(lote))
		e.queue.Requeue(lote)
		return
	}
	e.logger.Info("eventos sincronizados", "quantidade", sincronizados)
}

func (e *Engine) loopComandos(ctx context.Context) {
	interval := time.Duration(e.cfg.Sync.ComandosPollIntervalSeconds) * time.Second
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			comandos, err := e.client.BuscarComandos(ctx, e.cfg.DispositivoID, e.cfg.SchemaName)
			if err != nil {
				e.logger.Warn("falha ao buscar comandos pendentes", "err", err)
				continue
			}
			for _, c := range comandos {
				// TODO: aplicar o comando no hardware/local (cadastro.pessoa,
				// unidade.bloquear, etc. — ver docs/edge/edge-sync.md) e
				// então confirmar via client.ConfirmarComando. Esse método
				// ainda não tem endpoint correspondente na Cloud (ver GAP em
				// internal/sync/client.go), então por ora só logamos.
				e.logger.Info("comando pendente recebido (execução ainda não implementada)",
					"id", c.ID, "tipo", c.TipoComando)
			}
		case <-ctx.Done():
			return
		}
	}
}
