package server

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/server/access"
	authn "github.com/notsuhas/envden/go/server/auth"
	"github.com/notsuhas/envden/go/server/middleware"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vaultchain"
)

func (app *App) found(w http.ResponseWriter, r *http.Request, data []byte) error {
	if data == nil {
		return enverrors.New(enverrors.NotFound, "Object unavailable")
	}
	app.write(w, r, data, "application/octet-stream", 200)

	return nil
}

func (app *App) readRoute(w http.ResponseWriter, r *http.Request, auth *shared.Auth, body []byte) (bool, error) {
	o := app.options
	id := auth.Request.VaultId
	path := r.URL.EscapedPath()
	parts := strings.Split(path, "/")
	for i, part := range parts {
		if decoded, err := url.PathUnescape(part); err == nil {
			parts[i] = decoded
		}
	}
	if middleware.RouteMethod(r) == "PUT" && len(parts) == 4 && parts[2] == "blobs" {
		return app.uploadBlob(w, r, auth, body)
	}
	if middleware.RouteMethod(r) != "GET" {
		return false, nil
	}
	if len(parts) == 4 && (parts[2] == "files" || parts[2] == "keyrings" || parts[2] == "blobs") {
		hash, err := shared.Binary(parts[3], 32)
		if err != nil {
			return false, err
		}

		kind := "blob"
		switch parts[2] {
		case "files":
			kind = "files"
		case "keyrings":
			kind = "keyring"
		}
		if err := access.RequireRead(o, auth, kind, hash); err != nil {
			return false, err
		}

		var data []byte
		switch kind {
		case "files":
			fileList, err := o.Storage.FileList(id, hash)
			if err != nil {
				return false, err
			}

			data = fileList

		case "keyring":
			stateResult, err := o.Storage.State(id, adapters.StateKeyring, hash)
			if err != nil {
				return false, err
			}

			data = stateResult

		default:
			getBlob, err := o.Storage.GetBlob(id, hash)
			if err != nil {
				return false, err
			}

			data = getBlob
		}
		if err := app.found(w, r, data); err != nil {
			return false, err
		}

		return true, nil
	}
	var result any
	switch path {
	case "/v1/head":
		err := access.RequireRead(o, auth, "history", nil)
		if err != nil {
			return false, err
		}
		headResult, err := o.Storage.Head(id)
		if err != nil {
			return false, err
		}

		head := headResult

		var data []byte
		if head != nil {
			row, err := o.Storage.Header(id, head)
			if err != nil {
				return false, err
			}
			if row != nil {
				data = row.Bytes
			}
		}
		err = app.found(w, r, data)
		if err != nil {
			return false, err
		}

		return true, nil

	case "/v1/envelope":
		err := access.RequireRead(o, auth, "envelope", nil)
		if err != nil {
			return false, err
		}
		stateResult2, err := o.Storage.State(id, adapters.StateEnvelope, []byte{})
		if err != nil {
			return false, err
		}
		err = app.found(w, r, stateResult2)
		if err != nil {
			return false, err
		}

		return true, nil

	case "/v1/blobs":
		err := access.RequireRead(o, auth, "blob", nil)
		if err != nil {
			return false, err
		}

		objects := []string{}
		blobHashes, err := o.Storage.BlobHashes(id)
		if err != nil {
			return false, err
		}

		for _, hash := range blobHashes {
			objects = append(objects, shared.Text(hash))
		}
		result = wire.ObjectsResponse{Objects: objects}
	case "/v1/devices":
		err := authn.RequireGate(o, auth, "unlocked")
		if err != nil {
			return false, err
		}
		chain1, chain2, err := vaultchain.Chain(o, id)
		if err != nil {
			return false, err
		}

		_, state := chain1, chain2
		devices := []wire.DeviceStatus{}
		for _, key := range state.DeviceOrder {
			device, ok := state.Devices[key]
			if !ok {
				continue
			}
			seen, err := o.Storage.Device(id, device.Id)
			if err != nil {
				return false, err
			}

			var version *string
			if seen != nil && seen.ClientVersion != "" {
				version = &seen.ClientVersion
			}
			devices = append(devices, wire.DeviceStatus{Id: shared.Text(device.Id), ClientVersion: version, Confirmed: version != nil})
		}
		result = wire.DevicesResponse{Devices: devices}
	case "/v1/headers", "/v1/entries":
		return app.historyRoute(w, r, auth, body)
	default:
		return false, nil
	}
	if err := app.json(w, r, result, 200); err != nil {
		return false, err
	}

	return true, nil
}
