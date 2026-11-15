package server

import (
	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	authn "github.com/notsuhas/envden/go/server/auth"
	repair "github.com/notsuhas/envden/go/server/repair"
	x "github.com/notsuhas/envden/go/server/shared"
	vault "github.com/notsuhas/envden/go/server/vault"
	"net/http"
	"strconv"
	"strings"
)

func protocolInput[T any](codec b.Codec[T], body []byte) T {
	defer func() {
		if cause := recover(); cause != nil {
			if err, ok := cause.(*e.Error); ok && (err.Code == e.UpdateRequired || err.Code == e.ServerTooOld) {
				x.Fail(e.ServerTooOld, "Update server")
			}
			x.Fail(e.InvalidInput, "Invalid input")
		}
	}()
	return x.Must(b.Decode(codec, body))
}
func (app *App) commitResponse(w http.ResponseWriter, r *http.Request, result a.CommitResult, conflict bool) {
	response := s.CommitResponse{Kind: string(result.Kind)}
	if result.Head != nil {
		head := x.Text(result.Head)
		response.Head = &head
	}
	code := 200
	if conflict && result.Kind == a.HeadMovedResult {
		code = 409
	}
	app.json(w, r, response, code)
}
func (app *App) dataRoute(w http.ResponseWriter, r *http.Request, auth *x.Auth, body []byte) bool {
	o := app.options
	path := r.URL.EscapedPath()
	id := auth.Request.VaultId
	if r.Method == "POST" && (path == "/v1/vault" || path == "/v1/swap") {
		swap := protocolInput(m.SwapCodec, body)
		digest := cr.H("swap", body)
		var result a.CommitResult
		if path == "/v1/vault" {
			result = vault.Create(o, auth, swap, digest)
		} else {
			var mailbox *int
			if raw, ok := r.URL.Query()["mailbox"]; ok {
				n, _ := strconv.Atoi(raw[0])
				mailbox = &n
			}
			result = vault.Commit(o, auth, swap, digest, mailbox)
		}
		app.commitResponse(w, r, result, path == "/v1/swap")
		return true
	}
	if strings.HasPrefix(path, "/v1/move/") || strings.HasPrefix(path, "/v1/repair/") {
		var result any
		parts := strings.Split(path, "/")
		switch r.Method + " " + path {
		case "POST /v1/move/session":
			result = vault.OpenMove(o, auth)
		case "POST /v1/move/freeze":
			result = vault.Freeze(o, auth, true)
		case "POST /v1/move/unfreeze":
			result = vault.Freeze(o, auth, false)
		case "POST /v1/move/discard":
			result = vault.DiscardMove(o, auth)
		case "GET /v1/move/period":
			authn.RequireGate(o, auth, "fresh")
			result = s.UnlockPeriod{Period: x.Must(o.Storage.Vault(id)).UnlockPeriod}
		case "GET /v1/move/sk-pub":
			authn.RequireGate(o, auth, "fresh")
			if x.Must(o.Storage.Vault(id)).SKRefused {
				x.Fail(e.RecoveryKitRequired, "Replace recovery kit before moving")
			}
			data := x.Must(o.Storage.State(id, a.StateSKPub, []byte{}))
			if data == nil {
				x.Fail(e.NotFound, "Missing public key")
			}
			app.write(w, r, data, "", 200)
			return true
		case "PUT /v1/move/period":
			value := x.Parse(s.UnlockPeriodSchema, body)
			authn.RequireMove(o, auth)
			metadata := x.Must(o.Storage.Vault(id))
			metadata.UnlockPeriod = value.Period
			x.Check(o.Storage.ConfigureVault(id, *metadata, nil, nil))
			result = s.KindResponse{Kind: "updated"}
		case "GET /v1/repair/status":
			authn.RequireRepair(o, auth)
			restored := x.Must(o.Storage.Vault(id)).Restored
			result = s.RepairStatus{RestoredHead: x.Text(restored.RestoredHead), RepairId: x.Text(restored.FinishProgress)}
		case "GET /v1/repair/reports":
			authn.RequireRepair(o, auth)
			objects := []string{}
			for _, row := range x.Must(o.Storage.States(id, a.StateRepairReport)) {
				objects = append(objects, x.Text(row.Bytes))
			}
			result = s.ObjectsResponse{Objects: objects}
		case "PUT /v1/repair/report":
			result = repair.StoreReport(o, auth, body)
		case "POST /v1/repair/finish":
			authn.RequireRepair(o, auth)
			value := x.Parse(s.RepairFinishSchema, body)
			data := x.Binary(value.Swap)
			swap := protocolInput(m.SwapCodec, data)
			if swap.Header.Body.Op != 12 {
				x.Fail(e.InvalidInput, "Repair close required")
			}
			if value.Kind == "login" {
				authn.FinishLogin(o, auth, "unlock", value.Message)
			} else {
				authn.FinishRegistration(o, auth, value.Message)
			}
			app.commitResponse(w, r, vault.Commit(o, auth, swap, cr.H("swap", data), nil), true)
			return true
		default:
			if len(parts) > 3 {
				if parts[2] == "move" {
					authn.RequireMove(o, auth)
				} else {
					authn.RequireRepair(o, auth)
				}
				if r.Method == "POST" && (parts[3] == "history" || parts[3] == "chain") {
					var committed a.CommitResult
					if parts[3] == "chain" {
						committed = repair.UploadChain(o, auth, protocolInput(b.List(m.SwapCodec), body))
					} else {
						committed = repair.UploadHistory(o, auth, protocolInput(m.SwapCodec, body), cr.H("swap", body), true)
					}
					app.commitResponse(w, r, committed, false)
					return true
				}
				if r.Method == "PUT" && len(parts) == 6 && parts[3] == "material" {
					result = repair.StoreMaterial(o, auth, parts[4], x.Binary(parts[5], 32), body)
				}
			}
		}
		if result != nil {
			app.json(w, r, result, 200)
			return true
		}
	}
	return app.readRoute(w, r, auth, body)
}
