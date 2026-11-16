package server

import (
	"context"
	"io"
	"maps"
	"net/http"
	"net/http/httptest"
	"slices"
	"testing"

	"github.com/notsuhas/envden/go/cli/ui/routes"
	"github.com/notsuhas/envden/go/cli/ui/routes/inputs"
	"github.com/notsuhas/envden/go/cli/ui/server/assets"
)

func TestHeadAnswersLikeGetWithoutOrigin(t *testing.T) {
	action := func(context.Context, inputs.Input) (any, error) { return []string{"laptop"}, nil }
	app := CreateDashboardApp(Dashboard{Token: "token", Port: 4100, Assets: map[string]assets.PageAsset{"/": {Body: []byte("<p>page</p>"), Type: "text/html"}}, Actions: routes.Actions{Devices: action}})
	server := httptest.NewServer(app)
	t.Cleanup(server.Close)

	for _, path := range []string{"/", "/api/devices", "/nope"} {
		getStatus, getHeader, _ := send(t, "GET", server.URL+path)
		headStatus, headHeader, body := send(t, "HEAD", server.URL+path)
		if headStatus != getStatus || !maps.EqualFunc(headHeader, getHeader, slices.Equal) {
			t.Errorf("%s: HEAD %d %v, GET %d %v", path, headStatus, headHeader, getStatus, getHeader)
		}

		if len(body) != 0 {
			t.Errorf("%s: HEAD body %q", path, body)
		}
	}
}

func send(t *testing.T, method, url string) (int, http.Header, []byte) {
	t.Helper()
	r, err := http.NewRequest(method, url, nil)
	if err != nil {
		t.Fatal(err)
	}

	r.Host = "127.0.0.1:4100"
	r.Header.Set("Authorization", "Bearer token")
	response, err := http.DefaultClient.Do(r)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = response.Body.Close() }()

	body, err := io.ReadAll(response.Body)
	if err != nil {
		t.Fatal(err)
	}

	response.Header.Del("Date")
	response.Header.Del("Content-Length")

	return response.StatusCode, response.Header, body
}
