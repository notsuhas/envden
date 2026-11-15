package server

import (
	"bytes"
	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	access "github.com/notsuhas/envden/go/server/access"
	authn "github.com/notsuhas/envden/go/server/auth"
	x "github.com/notsuhas/envden/go/server/shared"
	v "github.com/notsuhas/envden/go/server/vaultchain"
	"net/http"
	"strings"
)

func (app *App) found(w http.ResponseWriter, r *http.Request, data []byte) {
	if data == nil {
		x.Fail(e.NotFound, "Object unavailable")
	}
	app.write(w, r, data, "application/octet-stream", 200)
}
func (app *App) readRoute(w http.ResponseWriter, r *http.Request, auth *x.Auth, body []byte) bool {
	o := app.options
	id := auth.Request.VaultId
	path := r.URL.EscapedPath()
	parts := strings.Split(path, "/")
	if r.Method == "PUT" && len(parts) == 4 && parts[2] == "blobs" {
		hash := x.Binary(parts[3], 32)
		x.Transaction(o.Storage, func() bool {
			fresh := *auth
			fresh.Member = v.Membership(o, id, auth.Request.Device) != nil
			metadata := x.Must(o.Storage.Vault(id))
			if metadata.Restored != nil {
				if !fresh.Member {
					x.Fail(e.NotMember, "Membership required")
				}
				authn.RequireRepair(o, &fresh)
			} else if !metadata.Active {
				owner := x.Must(o.Storage.State(id, a.StateMoveSession, []byte{}))
				if owner == nil || !bytes.Equal(owner, auth.Request.Device) {
					x.Fail(e.Moving, "Vault moving")
				}
			} else {
				authn.RequireGate(o, &fresh, "unlocked")
			}
			if len(body) > 16777216 || len(body) == 0 || !bytes.Equal(cr.H("blob", body), hash) {
				x.Fail(e.InvalidInput, "Invalid blob")
			}
			x.Check(o.Storage.PutBlob(id, hash, body, func(data []byte) ([]byte, error) { return cr.H("blob", data), nil }, o.Now(), 0))
			return true
		})
		app.json(w, r, s.KindResponse{Kind: "uploaded"}, 200)
		return true
	}
	if r.Method != "GET" {
		return false
	}
	if len(parts) == 4 && (parts[2] == "files" || parts[2] == "keyrings" || parts[2] == "blobs") {
		hash := x.Binary(parts[3], 32)
		kind := "blob"
		if parts[2] == "files" {
			kind = "files"
		} else if parts[2] == "keyrings" {
			kind = "keyring"
		}
		access.RequireRead(o, auth, kind, hash)
		var data []byte
		switch kind {
		case "files":
			data = x.Must(o.Storage.FileList(id, hash))
		case "keyring":
			data = x.Must(o.Storage.State(id, a.StateKeyring, hash))
		default:
			data = x.Must(o.Storage.GetBlob(id, hash))
		}
		app.found(w, r, data)
		return true
	}
	var result any
	switch path {
	case "/v1/head":
		access.RequireRead(o, auth, "history", nil)
		head := x.Must(o.Storage.Head(id))
		var data []byte
		if head != nil {
			row := x.Must(o.Storage.Header(id, head))
			if row != nil {
				data = row.Bytes
			}
		}
		app.found(w, r, data)
		return true
	case "/v1/envelope":
		access.RequireRead(o, auth, "envelope", nil)
		app.found(w, r, x.Must(o.Storage.State(id, a.StateEnvelope, []byte{})))
		return true
	case "/v1/blobs":
		access.RequireRead(o, auth, "blob", nil)
		objects := []string{}
		for _, hash := range x.Must(o.Storage.BlobHashes(id)) {
			objects = append(objects, x.Text(hash))
		}
		result = s.ObjectsResponse{Objects: objects}
	case "/v1/devices":
		authn.RequireGate(o, auth, "unlocked")
		_, state := v.Chain(o, id)
		devices := []s.DeviceStatus{}
		for _, key := range state.DeviceOrder {
			device, ok := state.Devices[key]
			if !ok {
				continue
			}
			seen := x.Must(o.Storage.Device(id, device.Id))
			var version *string
			if seen != nil && seen.ClientVersion != "" {
				version = &seen.ClientVersion
			}
			devices = append(devices, s.DeviceStatus{Id: x.Text(device.Id), ClientVersion: version, Confirmed: version != nil})
		}
		result = s.DevicesResponse{Devices: devices}
	case "/v1/headers", "/v1/entries":
		access.RequireRead(o, auth, "history", nil)
		from := uint64(0)
		to := ^uint64(0)
		query := r.URL.Query()
		if raw, ok := query["from"]; ok {
			from = x.Input(func() uint64 { return parseSequence(raw[0]) })
		}
		if raw, ok := query["to"]; ok {
			to = x.Input(func() uint64 { return parseSequence(raw[0]) })
		}
		if to < from {
			x.Fail(e.InvalidInput, "Invalid range")
		}
		var rows []a.StoredHeader
		if path == "/v1/headers" {
			rows = x.Must(o.Storage.Headers(id, from, to, 100, 786375))
		} else {
			rows = x.Must(o.Storage.Entries(id, from, to, 100, 786375))
		}
		objects := []string{}
		size := 0
		for _, row := range rows {
			encoded := x.Text(row.Bytes)
			size += len(encoded) + 3
			if size > 1048500 {
				if len(objects) == 0 {
					x.Fail(e.InvalidData, "History object too large")
				}
				break
			}
			objects = append(objects, encoded)
		}
		result = s.ObjectsResponse{Objects: objects}
	default:
		return false
	}
	app.json(w, r, result, 200)
	return true
}
