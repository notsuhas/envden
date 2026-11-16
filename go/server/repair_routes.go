package server

import (
	"net/http"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	authn "github.com/notsuhas/envden/go/server/auth"
	"github.com/notsuhas/envden/go/server/middleware"
	"github.com/notsuhas/envden/go/server/repair"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vault"
)

func (app *App) repairRoute(w http.ResponseWriter, r *http.Request, auth *shared.Auth, body []byte) (bool, error) {
	o := app.options
	path := r.URL.EscapedPath()
	id := auth.Request.VaultId
	var result any
	switch middleware.RouteMethod(r) + " " + path {
	case "GET /v1/repair/status":
		err := authn.RequireRepair(o, auth)
		if err != nil {
			return false, err
		}
		vaultResult4, err := o.Storage.Vault(id)
		if err != nil {
			return false, err
		}

		restored := vaultResult4.Restored
		result = wire.RepairStatus{RestoredHead: shared.Text(restored.RestoredHead), RepairId: shared.Text(restored.FinishProgress)}
	case "GET /v1/repair/reports":
		err := authn.RequireRepair(o, auth)
		if err != nil {
			return false, err
		}

		objects := []string{}
		states, err := o.Storage.States(id, adapters.StateRepairReport)
		if err != nil {
			return false, err
		}

		for _, row := range states {
			objects = append(objects, shared.Text(row.Bytes))
		}
		result = wire.ObjectsResponse{Objects: objects}
	case "PUT /v1/repair/report":
		storeReport, err := repair.StoreReport(o, auth, body)
		if err != nil {
			return false, err
		}

		result = storeReport

	case "POST /v1/repair/finish":
		err := authn.RequireRepair(o, auth)
		if err != nil {
			return false, err
		}
		parseResult, err := shared.Parse(wire.RepairFinishSchema, body)
		if err != nil {
			return false, err
		}

		value := parseResult
		binary, err := shared.Binary(value.Swap)
		if err != nil {
			return false, err
		}

		data := binary
		protocolInputResult, err := protocolInput(manifests.SwapCodec, data)
		if err != nil {
			return false, err
		}

		swap := protocolInputResult
		if swap.Header.Body.Op != 12 {
			return false, enverrors.New(enverrors.InvalidInput, "Repair close required")
		}
		if value.Kind == "login" {
			if _, err := authn.FinishLogin(o, auth, "unlock", value.Message); err != nil {
				return false, err
			}
		} else {
			if _, err := authn.FinishRegistration(o, auth, value.Message); err != nil {
				return false, err
			}
		}
		commitResult, err := vault.Commit(o, auth, swap, crypto.H("swap", data), nil)
		if err != nil {
			return false, err
		}
		err = app.commitResponse(w, r, commitResult, true)
		if err != nil {
			return false, err
		}

		return true, nil

	default:
		return false, nil
	}
	if result != nil {
		if err := app.json(w, r, result, 200); err != nil {
			return false, err
		}

		return true, nil
	}

	return false, nil
}
