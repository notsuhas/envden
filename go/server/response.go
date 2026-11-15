package server

import (
	"fmt"
	"io"
	"net/http"
	"strings"

	enverrors "github.com/notsuhas/envden/go/core/errors"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/server/shared"
)

func (app *App) write(w http.ResponseWriter, r *http.Request, body []byte, contentType string, code int) {
	if r.Method == "HEAD" {
		w.Header().Set("Content-Length", "0")
	}
	if contentType != "" {
		w.Header().Set("Content-Type", contentType)
	}
	w.WriteHeader(code)
	if r.Method != "HEAD" {
		_, _ = w.Write(body) //nolint:gosec // G705: fixed content types carry encoded JSON or HTML from the escaping status renderer.
	}
}

func (app *App) json(w http.ResponseWriter, r *http.Request, value any, code int) error {
	response, ok := value.(wire.LoginFinishResponse)
	if ok && response.Kind == "unlocked" {
		value = struct {
			UnlockedUntil *int64 `json:"unlockedUntil"`
			FreshUntil    *int64 `json:"freshUntil"`
			Kind          string `json:"kind"`
		}{response.UnlockedUntil, response.FreshUntil, response.Kind}
	}
	encoded, err := shared.JSON(value)
	if err != nil {
		return err
	}

	app.write(w, r, encoded, "application/json", code)

	return nil
}

var statuses = map[enverrors.Code]int{"BUSY": 503, "INVALID_INPUT": 400, "INVALID_DATA": 400, "UPDATE_REQUIRED": 426, "ROLLBACK": 409, "FORK": 409, "NOT_MEMBER": 403, "UNAUTHORIZED": 401, "LOCKED": 403, "RECOVERY_KIT_REQUIRED": 409, "STORAGE_QUOTA": 507, "RATE_LIMITED": 429, "CONFLICT": 409, "NOT_FOUND": 404, "HEAD_MOVED": 409, "RESTORED_MODE": 409, "MOVING": 409, "SERVER_TOO_OLD": 426, "CLIENT_TOO_OLD": 426, "NOT_IMPLEMENTED": 501, "INTERNAL": 500, "SERVER_UNREACHABLE": 502}

func (app *App) onError(w http.ResponseWriter, r *http.Request, cause error) error {
	code := enverrors.Internal
	err, ok := enverrors.As(cause)
	if ok {
		code = err.Code
	}
	if code == enverrors.Internal {
		out := app.options.Stderr
		if out == nil {
			out = io.Discard
		}
		_, _ = fmt.Fprintln(out, "envden request failed", code, r.Method)
	}
	result := wire.ErrorResponse{Error: string(code)}
	if code == enverrors.Unauthorized && strings.HasPrefix(r.URL.EscapedPath(), "/v1/opaque/login/") {
		hint := "The vault may have moved; try the current server address"
		result.Hint = &hint
	}

	return app.json(w, r, result, statuses[code])
}
