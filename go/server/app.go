package server

import (
	"fmt"
	e "github.com/notsuhas/envden/go/core/errors"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	requests "github.com/notsuhas/envden/go/core/protocol/requests"
	versions "github.com/notsuhas/envden/go/core/protocol/versions"
	mw "github.com/notsuhas/envden/go/server/middleware"
	x "github.com/notsuhas/envden/go/server/shared"
	status "github.com/notsuhas/envden/go/server/status"
	"io"
	"net/http"
	"strings"
	"sync"
)

type Options = x.Options
type ServerKeys = x.Keys
type Config = x.Config
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
		options.ReserveBody = mw.NewBodyBudget().Reserve
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
	if tooLarge(w, r) {
		return
	}
	normalizeRequestURL(r)

	buffered := newBufferedResponse()
	app.handle(buffered, r)
	buffered.flush(w)
}

// handle runs under the request lock; the response is sent after release, as Bun streams it.
func (app *App) handle(w http.ResponseWriter, r *http.Request) {
	app.mu.Lock()
	defer app.mu.Unlock()
	defer func() {
		if err := recover(); err != nil {
			app.onError(w, r, err)
		}
	}()
	o := app.options
	path := r.URL.EscapedPath()
	method := r.Method
	if method == "HEAD" {
		method = "GET"
	}
	if method == "GET" && path == "/v1/hello" {
		mw.RequestRoute(r)
		challenge := x.Binary(r.URL.Query().Get("challenge"), 32)
		hello := x.Must(requests.BuildHello(s.ServerHello{Challenge: challenge, Host: strings.ToLower(requestHost(r)), ServerSignPub: o.ServerKeys.PublicKey, AppVersion: o.Config.AppVersion, MinClient: o.Config.MinClient, Protocols: []int{1}}, o.ServerKeys.SecretKey))
		app.json(w, r, s.HelloResponse{Hello: x.Text(b.SignedCodec(s.ServerHelloCodec).Write(hello))}, 200)
		return
	}
	if method == "GET" && (path == "/" || path == "/v1/status") {
		status.Headers(w.Header())
		mw.RequestRoute(r)
		if !app.status.Enabled {
			x.Fail(e.NotFound, "Status page disabled")
		}
		if !app.status.Admit(o.Now()) {
			x.Fail(e.RateLimited, "Too many status requests")
		}
		value := status.Read(o, app.status)
		if path == "/v1/status" {
			app.json(w, r, value, 200)
		} else {
			app.write(w, r, []byte(status.Render(value, o.Now())), "text/html; charset=UTF-8", 200)
		}
		return
	}
	if path == "/v1" || strings.HasPrefix(path, "/v1/") {
		auth, body, release := mw.Verify(o, r)
		defer release()
		if app.route(w, r, auth, body) {
			return
		}
	}
	app.write(w, r, []byte("404 Not Found"), "text/plain; charset=UTF-8", 404)
}
func (app *App) write(w http.ResponseWriter, r *http.Request, body []byte, contentType string, code int) {
	if r.Method == "HEAD" {
		w.Header().Set("Content-Length", "0")
	}
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.WriteHeader(code)
	if r.Method != "HEAD" {
		_, _ = w.Write(body)
	}
}
func (app *App) json(w http.ResponseWriter, r *http.Request, value any, code int) {
	if response, ok := value.(s.LoginFinishResponse); ok && response.Kind == "unlocked" {
		value = struct {
			UnlockedUntil *int64 `json:"unlockedUntil"`
			FreshUntil    *int64 `json:"freshUntil"`
			Kind          string `json:"kind"`
		}{response.UnlockedUntil, response.FreshUntil, response.Kind}
	}
	app.write(w, r, x.JSON(value), "application/json", code)
}

var statuses = map[e.Code]int{"BUSY": 503, "INVALID_INPUT": 400, "INVALID_DATA": 400, "UPDATE_REQUIRED": 426, "ROLLBACK": 409, "FORK": 409, "NOT_MEMBER": 403, "UNAUTHORIZED": 401, "LOCKED": 403, "RECOVERY_KIT_REQUIRED": 409, "STORAGE_QUOTA": 507, "RATE_LIMITED": 429, "CONFLICT": 409, "NOT_FOUND": 404, "HEAD_MOVED": 409, "RESTORED_MODE": 409, "MOVING": 409, "SERVER_TOO_OLD": 426, "CLIENT_TOO_OLD": 426, "NOT_IMPLEMENTED": 501, "INTERNAL": 500, "SERVER_UNREACHABLE": 502}

func (app *App) onError(w http.ResponseWriter, r *http.Request, cause any) {
	code := e.Internal
	if err, ok := cause.(*e.Error); ok {
		code = err.Code
	}
	if code == e.Internal {
		out := app.options.Stderr
		if out == nil {
			out = io.Discard
		}
		fmt.Fprintln(out, "envden request failed", code, r.Method)
	}
	result := s.ErrorResponse{Error: string(code)}
	if code == e.Unauthorized && strings.HasPrefix(r.URL.EscapedPath(), "/v1/opaque/login/") {
		hint := "The vault may have moved; try the current server address"
		result.Hint = &hint
	}
	app.json(w, r, result, statuses[code])
}

func requestHost(r *http.Request) string {
	u := *r.URL
	if u.Host == "" {
		u.Host = r.Host
	}
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
