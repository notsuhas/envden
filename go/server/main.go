package server

import (
	"context"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strconv"
	"sync"
	"syscall"
	"time"

	sqlite "github.com/notsuhas/envden/go/adapters/storage/sqlite"
	a "github.com/notsuhas/envden/go/core/adapters"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	identity "github.com/notsuhas/envden/go/server/identity"
	repair "github.com/notsuhas/envden/go/server/repair"
	x "github.com/notsuhas/envden/go/server/shared"
	status "github.com/notsuhas/envden/go/server/status"
)

type Scheduler interface {
	After(time.Duration, func()) func()
	Every(time.Duration, func()) func()
}
type ServeOptions struct {
	DataDir        string
	Port           *int
	MinClient      string
	SetupToken     string
	Restored       bool
	Now            func() int64
	Scheduler      Scheduler
	Stdout, Stderr io.Writer
	Listen         func(http.Handler) (net.Listener, error)
	Env            map[string]string
}
type Running struct {
	Server   *http.Server
	Storage  a.Storage
	URL      string
	App      *App
	shutdown func() error
}

func (r *Running) Shutdown() error { return r.shutdown() }
func Serve(options ServeOptions) (running *Running, err error) {
	defer func() {
		if cause := recover(); cause != nil {
			err = cause.(error)
		}
	}()
	dir := options.DataDir
	if dir == "" {
		home := x.Must(os.UserHomeDir())
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
	keys := x.Must(identity.LoadServerKeys(dir))
	storage := x.Must(sqlite.CreateSqliteStorageAdapter(dir, now()))
	defer func() {
		if running == nil {
			storage.Close()
		}
	}()
	token := x.Must(identity.InitializeSetup(storage, keys.PublicKey, options.SetupToken))
	if token != "" {
		fmt.Fprintln(stdout, "Setup token. Paste it when `envden setup` or `envden server move` asks:")
		fmt.Fprintln(stdout, "  "+token)
	}
	minClient := options.MinClient
	if minClient == "" {
		minClient = "0.0.0"
	}
	o := Options{Storage: storage, Now: now, ServerKeys: keys, Config: Config{AppVersion: "0.3.8", MinClient: minClient}, Stderr: stderr}
	if options.Restored {
		for _, v := range repair.StartRestored(o) {
			if v.Token != "" {
				fmt.Fprintf(stdout, "Repair token for vault %s. Paste it when `envden server repair` asks:\n  %s\n", b.Base32(v.VaultID), v.Token)
			} else {
				fmt.Fprintf(stdout, "Vault %s %s\n", b.Base32(v.VaultID), repair.RestoreNotice(v.Kind))
			}
		}
	}
	env := options.Env
	if env == nil {
		env = map[string]string{"ENVDEN_STATUS_PAGE": os.Getenv("ENVDEN_STATUS_PAGE")}
	}
	state := status.New(now(), env)
	app := x.Must(CreateApp(o, state))
	port := 4280
	if options.Port != nil {
		port = *options.Port
	}
	var listener net.Listener
	if options.Listen != nil {
		listener = x.Must(options.Listen(app))
	} else {
		listener = x.Must(net.Listen("tcp", "127.0.0.1:"+strconv.Itoa(port)))
	}
	httpServer := &http.Server{Handler: app}
	url := "http://" + listener.Addr().String() + "/"
	fmt.Fprintln(stdout, "envden listening on "+url)
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
func LocalSetupToken(dataDir string, now int64) (string, error) {
	keys, err := identity.LoadServerKeys(dataDir)
	if err != nil {
		return "", err
	}
	storage, err := sqlite.CreateSqliteStorageAdapter(dataDir, now)
	if err != nil {
		return "", err
	}
	defer storage.Close()
	return identity.ReissueSetup(storage, keys.PublicKey)
}
