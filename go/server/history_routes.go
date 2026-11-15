package server

import (
	"net/http"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/server/access"
	"github.com/notsuhas/envden/go/server/shared"
)

func (app *App) historyRoute(w http.ResponseWriter, r *http.Request, auth *shared.Auth, body []byte) (bool, error) {
	o := app.options
	id := auth.Request.VaultId
	path := r.URL.EscapedPath()
	err := access.RequireRead(o, auth, "history", nil)
	if err != nil {
		return false, err
	}

	from := uint64(0)
	to := ^uint64(0)
	query := r.URL.Query()
	raw, ok := query["from"]
	if ok {
		input, err := shared.Input(func() (uint64, error) {
			return parseSequence(raw[0])
		})
		if err != nil {
			return false, err
		}

		from = input
	}
	raw, ok = query["to"]
	if ok {
		inputResult, err := shared.Input(func() (uint64, error) {
			return parseSequence(raw[0])
		})
		if err != nil {
			return false, err
		}

		to = inputResult
	}
	if to < from {
		return false, enverrors.New(enverrors.InvalidInput, "Invalid range")
	}
	var rows []adapters.StoredHeader
	if path == "/v1/headers" {
		headers, err := o.Storage.Headers(id, from, to, 100, 786375)
		if err != nil {
			return false, err
		}

		rows = headers
	} else {
		entries, err := o.Storage.Entries(id, from, to, 100, 786375)
		if err != nil {
			return false, err
		}

		rows = entries
	}
	objects := []string{}
	size := 0
	for _, row := range rows {
		encoded := shared.Text(row.Bytes)
		size += len(encoded) + 3
		if size > 1048500 {
			if len(objects) == 0 {
				return false, enverrors.New(enverrors.InvalidData, "History object too large")
			}
			break
		}
		objects = append(objects, encoded)
	}
	if err := app.json(w, r, wire.ObjectsResponse{Objects: objects}, 200); err != nil {
		return false, err
	}

	return true, nil
}
