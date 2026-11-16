package server

import (
	"context"
	"fmt"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"sync"
	"syscall"
	"time"

	"github.com/notsuhas/envden/go/adapters/storage/sqlite"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/server/identity"
	"github.com/notsuhas/envden/go/server/repair"
	"github.com/notsuhas/envden/go/server/status"
)

func Serve(options ServeOptions) (running *Running, err error) {
	dir := options.DataDir
	if dir == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return nil, err
		}

		dir = filepath.Join(home, ".envden", "server")
	}
	now := options.Now
	if now == nil {
		now = func() int64 { return time.Now().UnixMilli() }
	}
	stdout, stderr := options.Stdout, options.Stderr
	if stdout == nil {
		stdout = os.Stdout
	}
	if stderr == nil {
		stderr = os.Stderr
	}
	keys, err := identity.LoadServerKeys(dir)
	if err != nil {
		return nil, err
	}

	storage, err := sqlite.CreateSqliteStorageAdapter(dir, now())
	if err != nil {
		return nil, err
	}

	defer func() {
		if running == nil {
			_ = storage.Close()
		}
	}()
	token, err := identity.InitializeSetup(storage, keys.PublicKey, options.SetupToken)
	if err != nil {
		return nil, err
	}
	if token != "" {
		_, _ = fmt.Fprintln(stdout, "Setup token. Paste it when `envden setup` or `envden server move` asks:")
		_, _ = fmt.Fprintln(stdout, "  "+token)
	}
	minClient := options.MinClient
	if minClient == "" {
		minClient = "0.0.0"
	}
	o := Options{Storage: storage, Now: now, ServerKeys: keys, Config: Config{AppVersion: "0.3.8", MinClient: minClient}, Stderr: stderr}
	if options.Restored {
		startRestored, err := repair.StartRestored(o)
		if err != nil {
			return nil, err
		}

		for _, v := range startRestored {
			if v.Token != "" {
				_, _ = fmt.Fprintf(stdout, "Repair token for vault %s. Paste it when `envden server repair` asks:\n  %s\n", encoding.Base32(v.VaultID), v.Token)
			} else {
				_, _ = fmt.Fprintf(stdout, "Vault %s %s\n", encoding.Base32(v.VaultID), repair.RestoreNotice(v.Kind))
			}
		}
	}
	env := options.Env
	if env == nil {
		env = map[string]string{"ENVDEN_STATUS_PAGE": os.Getenv("ENVDEN_STATUS_PAGE")}
	}
	state := status.New(now(), env)
	app, err := CreateApp(o, state)
	if err != nil {
		return nil, err
	}

	port := 4280
	if options.Port != nil {
		port = *options.Port
	}
	var listener net.Listener
	if options.Listen != nil {
		listen, err := options.Listen(app)
		if err != nil {
			return nil, err
		}

		listener = listen
	} else {
		listenResult, err := net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(port))
		if err != nil {
			return nil, fmt.Errorf("Failed to start server. Is port %d in use?", port) //nolint:staticcheck // ST1005: preserve Bun's user-facing diagnostic.
		}

		listener = listenResult
	}
	httpServer := &http.Server{Handler: app, ConnContext: connectionContext, ReadHeaderTimeout: 10 * time.Second, IdleTimeout: 10 * time.Second}
	url := "http://" + listener.Addr().String() + "/"
	_, _ = fmt.Fprintln(stdout, "envden listening on "+url)
	scheduler := options.Scheduler
	if scheduler == nil {
		scheduler = systemScheduler{}
	}
	stopped := make(chan struct{})
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	prune := func() {
		app.mu.Lock()
		defer app.mu.Unlock()
		select {
		case <-stopped:
			return

		default:
		}
		state.LastPrune = &status.Prune{At: now(), OK: pruneHistory(o)}
	}

	jobs := []func(){scheduler.After(time.Minute, prune), scheduler.Every(time.Hour, prune)}
	once := sync.Once{}
	var shutdownErr error
	shutdown := func() error {
		once.Do(func() {
			signal.Stop(signals)
			close(stopped)
			for _, cancel := range jobs {
				cancel()
			}
			shutdownErr = httpServer.Shutdown(context.Background())
			app.mu.Lock()
			defer app.mu.Unlock()
			closeErr := storage.Close()
			if shutdownErr == nil {
				shutdownErr = closeErr
			}
		})

		return shutdownErr
	}
	running = &Running{Server: httpServer, Storage: storage, URL: url, App: app, shutdown: shutdown}
	go func() { _ = httpServer.Serve(compatibleListener{listener}) }()
	go func() {
		select {
		case <-signals:
			_ = shutdown()
		case <-stopped:
		}
	}()

	return running, nil
}
