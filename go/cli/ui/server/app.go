package server

import (
	"io"
	"net/http"
	"strconv"
	"strings"

	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/ui/routes"
	"github.com/notsuhas/envden/go/cli/ui/server/assets"
	"github.com/notsuhas/envden/go/core/errors"
)

type Dashboard struct {
	Token   string
	Port    int
	Assets  map[string]assets.PageAsset
	Actions routes.Actions
}

func CreateDashboardApp(dashboard Dashboard) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_ = http.NewResponseController(w).EnableFullDuplex()
		r.Body = unclosedBody{r.Body}
		for k, v := range securityHeaders {
			w.Header().Set(k, v)
		}

		if !AllowedHost(r.Host, dashboard.Port) {
			writeJSON(w, 421, ErrorResponse{errors.InvalidInput, "Unexpected host"})

			return
		}

		if strings.HasPrefix(r.URL.Path, "/api/") {
			if !TokenMatches(r.Header.Get("Authorization"), dashboard.Token) {
				writeJSON(w, 401, ErrorResponse{errors.Unauthorized, "Open the link envden ui printed"})

				return
			}

			if r.Method != "GET" && r.Method != "HEAD" && !SameOrigin(r.Header.Get("Origin"), r.Host) {
				writeJSON(w, 403, ErrorResponse{errors.Unauthorized, "Cross-origin request refused"})

				return
			}
		}

		result, found, err := routes.API(r, dashboard.Actions)
		if err != nil {
			body := ErrorBody(err)
			writeJSON(w, ErrorStatus(body.Error), body)

			return
		}

		if found {
			writeJSON(w, 200, result)

			return
		}

		if asset, ok := dashboard.Assets[r.URL.Path]; ok && (r.Method == "GET" || r.Method == "HEAD") {
			w.Header().Set("Content-Type", asset.Type)
			if r.Method != "HEAD" {
				w.Header().Set("Content-Length", strconv.Itoa(len(asset.Body)))
			}
			w.WriteHeader(200)
			if r.Method != "HEAD" {
				_, _ = w.Write(asset.Body)
			}

			return
		}

		w.Header().Set("Content-Type", "text/plain; charset=UTF-8")
		w.WriteHeader(404)
		_, _ = w.Write([]byte("404 Not Found"))
	})
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	raw, err := jsonvalue.Marshal(value)
	if err != nil {
		body := ErrorBody(err)
		status = ErrorStatus(body.Error)
		raw, _ = jsonvalue.Marshal(body)
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_, _ = w.Write(raw) //nolint:gosec // JSON is served with an application/json content type.
}

type unclosedBody struct{ io.ReadCloser }

func (unclosedBody) Close() error { return nil }
