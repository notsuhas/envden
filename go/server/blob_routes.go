package server

import (
	"bytes"
	"net/http"
	"strings"

	"github.com/notsuhas/envden/go/core/adapters"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	authn "github.com/notsuhas/envden/go/server/auth"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vaultchain"
)

func (app *App) uploadBlob(w http.ResponseWriter, r *http.Request, auth *shared.Auth, body []byte) (bool, error) {
	o := app.options
	id := auth.Request.VaultId
	parts := strings.Split(r.URL.EscapedPath(), "/")

	hash, err := shared.Binary(parts[3], 32)
	if err != nil {
		return false, err
	}

	_, err = shared.Transaction(o.Storage, func() (bool, error) {
		fresh := *auth
		membership, err := vaultchain.Membership(o, id, auth.Request.Device)
		if err != nil {
			return false, err
		}

		fresh.Member = membership != nil
		metadata, err := o.Storage.Vault(id)
		if err != nil {
			return false, err
		}
		if metadata.Restored != nil {
			if !fresh.Member {
				return false, enverrors.New(enverrors.NotMember, "Membership required")
			}
			if err := authn.RequireRepair(o, &fresh); err != nil {
				return false, err
			}
		} else if !metadata.Active {
			owner, err := o.Storage.State(id, adapters.StateMoveSession, []byte{})
			if err != nil {
				return false, err
			}
			if owner == nil || !bytes.Equal(owner, auth.Request.Device) {
				return false, enverrors.New(enverrors.Moving, "Vault moving")
			}
		} else {
			if err := authn.RequireGate(o, &fresh, "unlocked"); err != nil {
				return false, err
			}
		}
		if len(body) > 16777216 || len(body) == 0 || !bytes.Equal(crypto.H("blob", body), hash) {
			return false, enverrors.New(enverrors.InvalidInput, "Invalid blob")
		}
		if err := o.Storage.PutBlob(id, hash, body, func(data []byte) ([]byte, error) { return crypto.H("blob", data), nil }, o.Now(), 0); err != nil {
			return false, err
		}

		return true, nil
	})
	if err != nil {
		return false, err
	}
	if err := app.json(w, r, wire.KindResponse{Kind: "uploaded"}, 200); err != nil {
		return false, err
	}

	return true, nil
}
