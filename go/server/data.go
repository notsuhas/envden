package server

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vault"
)

func protocolInput[T any](codec encoding.Codec[T], body []byte) (T, error) {
	value, err := encoding.Decode(codec, body)
	if err != nil {
		if enverrors.Is(err, enverrors.UpdateRequired) || enverrors.Is(err, enverrors.ServerTooOld) {
			return *new(T), enverrors.New(enverrors.ServerTooOld, "Update server")
		}

		return *new(T), enverrors.New(enverrors.InvalidInput, "Invalid input")
	}

	return value, nil
}

func (app *App) commitResponse(w http.ResponseWriter, r *http.Request, result adapters.CommitResult, conflict bool) error {
	response := wire.CommitResponse{Kind: string(result.Kind)}
	if result.Head != nil {
		head := shared.Text(result.Head)
		response.Head = &head
	}
	code := 200
	if conflict && result.Kind == adapters.HeadMovedResult {
		code = 409
	}

	return app.json(w, r, response, code)
}

func (app *App) dataRoute(w http.ResponseWriter, r *http.Request, auth *shared.Auth, body []byte) (bool, error) {
	o := app.options
	path := r.URL.EscapedPath()
	if r.Method == "POST" && (path == "/v1/vault" || path == "/v1/swap") {
		swap, err := protocolInput(manifests.SwapCodec, body)
		if err != nil {
			return false, err
		}

		digest := crypto.H("swap", body)
		var result adapters.CommitResult
		if path == "/v1/vault" {
			create, err := vault.Create(o, auth, swap, digest)
			if err != nil {
				return false, err
			}

			result = create
		} else {
			var mailbox *int
			raw, ok := r.URL.Query()["mailbox"]
			if ok {
				n, _ := strconv.Atoi(raw[0])
				mailbox = &n
			}
			commit, err := vault.Commit(o, auth, swap, digest, mailbox)
			if err != nil {
				return false, err
			}

			result = commit
		}
		if err := app.commitResponse(w, r, result, path == "/v1/swap"); err != nil {
			return false, err
		}

		return true, nil
	}
	if strings.HasPrefix(path, "/v1/move/") || strings.HasPrefix(path, "/v1/repair/") {
		for _, route := range []func(http.ResponseWriter, *http.Request, *shared.Auth, []byte) (bool, error){app.moveRoute, app.repairRoute, app.importRoute} {
			handled, err := route(w, r, auth, body)
			if err != nil || handled {
				return handled, err
			}
		}
	}

	return app.readRoute(w, r, auth, body)
}
