package server

import (
	"context"
	"errors"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/ui/routes"
	"github.com/notsuhas/envden/go/cli/ui/routes/inputs"
	"github.com/notsuhas/envden/go/cli/ui/server/assets"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
)

func TestDashboardSecurityAndRouting(t *testing.T) {
	action := func(context.Context, inputs.Input) (any, error) {
		return struct {
			Kind string `json:"kind"`
		}{"ok"}, nil
	}
	app := CreateDashboardApp(Dashboard{Token: "token", Port: 4100, Assets: map[string]assets.PageAsset{"/": {Body: []byte("<p>page</p>"), Type: "text/html"}}, Actions: routes.Actions{Status: action, Push: action, Rename: action, Resolve: action, Restore: action, History: action}})
	for _, row := range []struct {
		method, path, host, auth, origin, body string
		status                                 int
		want                                   string
	}{
		{"GET", "/", "127.0.0.1:4100", "", "", "", 200, "<p>page</p>"},
		{"GET", "/api/status", "127.0.0.1:4100", "", "", "", 401, `{"error":"UNAUTHORIZED","message":"Open the link envden ui printed"}`},
		{"GET", "/api/status", "evil:4100", "Bearer token", "", "", 421, `{"error":"INVALID_INPUT","message":"Unexpected host"}`},
		{"POST", "/api/push", "127.0.0.1:4100", "Bearer token", "http://evil", "{}", 403, `{"error":"UNAUTHORIZED","message":"Cross-origin request refused"}`},
		{"POST", "/api/push", "127.0.0.1:4100", "Bearer token", "", "{}", 403, `{"error":"UNAUTHORIZED","message":"Cross-origin request refused"}`},
		{"GET", "/api/status", "localhost:4100", "Bearer token", "", "", 200, `{"kind":"ok"}`},
		{"GET", "/nope", "127.0.0.1:4100", "Bearer token", "", "", 404, "404 Not Found"},
		{"POST", "/api/devices/rename", "127.0.0.1:4100", "Bearer token", "http://127.0.0.1:4100", `{"name":"x","extra":1}`, 400, `{"error":"INVALID_INPUT","message":"Enter a device name"}`},
		{"POST", "/api/resolve", "127.0.0.1:4100", "Bearer token", "http://127.0.0.1:4100", `{"id":"x","choice":"edit"}`, 400, `{"error":"INVALID_INPUT","message":"Choose a conflict and a side"}`},
	} {
		t.Run(row.path+row.host+row.auth+row.body, func(t *testing.T) {
			request := httptest.NewRequest(row.method, "http://127.0.0.1:4100"+row.path, strings.NewReader(row.body))
			request.Host = row.host
			request.Header.Set("Authorization", row.auth)
			request.Header.Set("Origin", row.origin)
			response := httptest.NewRecorder()
			app.ServeHTTP(response, request)
			if response.Code != row.status || response.Body.String() != row.want {
				t.Fatalf("got %d %s", response.Code, response.Body.String())
			}

			if response.Header().Get("X-Content-Type-Options") != "nosniff" || !strings.Contains(response.Header().Get("Content-Security-Policy"), "frame-ancestors 'none'") {
				t.Fatal("missing security headers")
			}
		})
	}
}

func TestHostAndToken(t *testing.T) {
	for _, row := range []struct {
		host string
		want bool
	}{{"127.0.0.1:4100", true}, {"localhost:4100", true}, {"LOCALHOST:4100", false}, {"127.0.0.1", false}, {"[::1]:4100", false}, {"", false}} {
		if AllowedHost(row.host, 4100) != row.want {
			t.Fatal(row)
		}
	}

	if !SameOrigin("http://localhost:4100", "localhost:4100") || SameOrigin("https://localhost:4100", "localhost:4100") || SameOrigin("", "localhost:4100") {
		t.Fatal("origin")
	}

	token, err := NewToken()
	if err != nil {
		t.Fatal(err)
	}

	other, err := NewToken()
	if err != nil {
		t.Fatal(err)
	}

	if len(token) != 43 || token == other {
		t.Fatal("token entropy")
	}

	for _, header := range []string{"", token, "bearer " + token, "Bearer " + token + "x", "Bearer " + token[1:]} {
		if TokenMatches(header, token) {
			t.Fatal("bad token accepted")
		}
	}

	if !TokenMatches("Bearer "+token, token) {
		t.Fatal("valid token rejected")
	}
}

func TestErrorsSanitized(t *testing.T) {
	body := ErrorBody(errors.New("secret"))
	if body.Message != "envden ui hit an internal error" || ErrorStatus(body.Error) != 500 {
		t.Fatal(body)
	}

	body = ErrorBody(envdenerrors.New(envdenerrors.Locked, "Locked"))
	if body.Message != "Locked" || ErrorStatus(body.Error) != 403 {
		t.Fatal(body)
	}
}

func TestDashboardAssetLength(t *testing.T) {
	app := CreateDashboardApp(Dashboard{Port: 4100, Assets: map[string]assets.PageAsset{"/": {Body: []byte("page"), Type: "text/html"}}})
	r := httptest.NewRequest("GET", "http://localhost:4100/", nil)
	w := httptest.NewRecorder()
	app.ServeHTTP(w, r)
	if w.Header().Get("Content-Length") != "4" {
		t.Fatal(w.Header())
	}
}
