package server

import (
	"net/http"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	authn "github.com/notsuhas/envden/go/server/auth"
	"github.com/notsuhas/envden/go/server/middleware"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vault"
)

func (app *App) moveRoute(w http.ResponseWriter, r *http.Request, auth *shared.Auth, body []byte) (bool, error) {
	o := app.options
	path := r.URL.EscapedPath()
	id := auth.Request.VaultId
	var result any
	switch middleware.RouteMethod(r) + " " + path {
	case "POST /v1/move/session":
		openMove, err := vault.OpenMove(o, auth)
		if err != nil {
			return false, err
		}

		result = openMove

	case "POST /v1/move/freeze":
		freeze, err := vault.Freeze(o, auth, true)
		if err != nil {
			return false, err
		}

		result = freeze

	case "POST /v1/move/unfreeze":
		freezeResult, err := vault.Freeze(o, auth, false)
		if err != nil {
			return false, err
		}

		result = freezeResult

	case "POST /v1/move/discard":
		discardMove, err := vault.DiscardMove(o, auth)
		if err != nil {
			return false, err
		}

		result = discardMove

	case "GET /v1/move/period":
		err := authn.RequireGate(o, auth, "fresh")
		if err != nil {
			return false, err
		}
		vaultResult, err := o.Storage.Vault(id)
		if err != nil {
			return false, err
		}

		result = wire.UnlockPeriod{Period: vaultResult.UnlockPeriod}
	case "GET /v1/move/sk-pub":
		err := authn.RequireGate(o, auth, "fresh")
		if err != nil {
			return false, err
		}
		vaultResult2, err := o.Storage.Vault(id)
		if err != nil {
			return false, err
		}
		if vaultResult2.SKRefused {
			return false, enverrors.New(enverrors.RecoveryKitRequired, "Replace recovery kit before moving")
		}
		state, err := o.Storage.State(id, adapters.StateSKPub, []byte{})
		if err != nil {
			return false, err
		}

		data := state
		if data == nil {
			return false, enverrors.New(enverrors.NotFound, "Missing public key")
		}
		app.write(w, r, data, "application/octet-stream", 200)

		return true, nil

	case "PUT /v1/move/period":
		parse, err := shared.Parse(wire.UnlockPeriodSchema, body)
		if err != nil {
			return false, err
		}

		value := parse
		err = authn.RequireMove(o, auth)
		if err != nil {
			return false, err
		}
		vaultResult3, err := o.Storage.Vault(id)
		if err != nil {
			return false, err
		}

		metadata := vaultResult3

		metadata.UnlockPeriod = value.Period
		err = o.Storage.ConfigureVault(id, *metadata, nil, nil)
		if err != nil {
			return false, err
		}

		result = wire.KindResponse{Kind: "updated"}
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
