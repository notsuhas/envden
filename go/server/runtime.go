package server

import (
	"io"
	"net"
	"net/http"
	"time"

	"github.com/notsuhas/envden/go/adapters/storage/sqlite"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/server/identity"
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
	Storage  adapters.Storage
	URL      string
	App      *App
	shutdown func() error
}

func (r *Running) Shutdown() error { return r.shutdown() }

func LocalSetupToken(dataDir string, now int64) (string, error) {
	loadServerKeys, err := identity.LoadServerKeys(dataDir)
	if err != nil {
		return "", err
	}

	keys := loadServerKeys
	if err != nil {
		return "", err
	}
	storage, err := sqlite.CreateSqliteStorageAdapter(dataDir, now)
	if err != nil {
		return "", err
	}
	defer func() { _ = storage.Close() }()

	return identity.ReissueSetup(storage, keys.PublicKey)
}
