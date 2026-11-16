package server

import (
	"net/http"
	"strings"
	"sync"

	enverrors "github.com/notsuhas/envden/go/core/errors"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/requests"
	"github.com/notsuhas/envden/go/core/protocol/versions"
	"github.com/notsuhas/envden/go/core/textcase"
	"github.com/notsuhas/envden/go/server/middleware"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/status"
)

type Options = shared.Options

type ServerKeys = shared.Keys

type Config = shared.Config

type App struct {
	options Options
	status  *status.State
	mu      sync.Mutex
}

func CreateApp(options Options, state ...*status.State) (*App, error) {
	if _, err := versions.ParseSemver(options.Config.AppVersion); err != nil {
		return nil, err
	}
	if _, err := versions.ParseSemver(options.Config.MinClient); err != nil {
		return nil, err
	}
	if options.ReserveBody == nil {
		options.ReserveBody = middleware.NewBodyBudget().Reserve
	}
	if options.ChainCache == nil {
		options.ChainCache = map[string]any{}
	}
	st := status.New(options.Now(), nil)
	if len(state) > 0 && state[0] != nil {
		st = state[0]
	}
	app := &App{options: options, status: st}
	if app.options.Await == nil {
		app.options.Await = app.await
	}

	return app, nil
}

func (app *App) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	if strings.EqualFold(r.Header.Get("Expect"), "100-continue") {
		w.WriteHeader(http.StatusContinue)
	}
	if tooLarge(w, r) {
		return
	}
	normalizeRequestURL(r)
	buffered := newBufferedResponse()
	app.handleLocked(buffered, r)
	buffered.flush(w)
}

// State changes run under the request lock; the response is sent after release.
func (app *App) handleLocked(w http.ResponseWriter, r *http.Request) {
	app.mu.Lock()
	defer app.mu.Unlock()
	defer func() {
		if recover() != nil {
			_ = app.onError(w, r, enverrors.New(enverrors.Internal, "Internal error"))
		}
	}()
	if err := app.handle(w, r); err != nil {
		_ = app.onError(w, r, err)
	}
}

func (app *App) handle(w http.ResponseWriter, r *http.Request) error {

	o := app.options
	path := r.URL.EscapedPath()
	if r.Host == "" {
		app.write(w, r, []byte("404 Not Found"), "text/plain; charset=UTF-8", 404)
		return nil
	}
	method := r.Method
	if method == "HEAD" {
		method = "GET"
	}
	if method == "GET" && path == "/v1/hello" {
		if _, err := middleware.RequestRoute(r); err != nil {
			return err
		}

		challenge, err := shared.Binary(r.URL.Query().Get("challenge"), 32)
		if err != nil {
			return err
		}

		hello, err := requests.BuildHello(wire.ServerHello{Challenge: challenge, Host: textcase.Lower(requestHost(r)), ServerSignPub: o.ServerKeys.PublicKey, AppVersion: o.Config.AppVersion, MinClient: o.Config.MinClient, Protocols: []int{1}}, o.ServerKeys.SecretKey)
		if err != nil {
			return err
		}

		return app.json(w, r, wire.HelloResponse{Hello: shared.Text(encoding.SignedCodec(wire.ServerHelloCodec).Write(hello))}, 200)
	}
	if method == "GET" && (path == "/" || path == "/v1/status") {
		status.Headers(w.Header())
		if _, err := middleware.RequestRoute(r); err != nil {
			return err
		}
		if !app.status.Enabled {
			return enverrors.New(enverrors.NotFound, "Status page disabled")
		}
		if !app.status.Admit(o.Now()) {
			return enverrors.New(enverrors.RateLimited, "Too many status requests")
		}
		value, err := status.Read(o, app.status)
		if err != nil {
			return err
		}
		if path == "/v1/status" {
			if err := app.json(w, r, value, 200); err != nil {
				return err
			}
		} else {
			app.write(w, r, []byte(status.Render(value, o.Now())), "text/html; charset=UTF-8", 200)
		}

		return nil
	}
	if path == "/v1" || strings.HasPrefix(path, "/v1/") {
		verify1, verify2, verify3, err := middleware.Verify(o, r)
		if err != nil {
			return err
		}

		auth, body, release := verify1, verify2, verify3
		defer release()
		routeResult, err := app.route(w, r, auth, body)
		if err != nil {
			return err
		}
		if routeResult {
			return nil
		}
	}
	app.write(w, r, []byte("404 Not Found"), "text/plain; charset=UTF-8", 404)

	return nil
}

func requestHost(r *http.Request) string {
	u := *r.URL
	u.Host = r.Host
	host := u.Hostname()
	if strings.HasPrefix(u.Host, "[") {
		return "[" + host + "]"
	}

	return host
}

func (app *App) await(fn func()) {
	app.mu.Unlock()
	defer app.mu.Lock()

	fn()
}
