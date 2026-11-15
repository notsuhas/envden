package auth

import (
	enverrors "github.com/notsuhas/envden/go/core/errors"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vaultchain"
)

func UnlockWindow(o shared.Options, id, device []byte) (wire.UnlockWindow, error) {
	state, err := o.Storage.Device(id, device)
	if err != nil {
		return wire.UnlockWindow{}, err
	}

	vault, err := o.Storage.Vault(id)
	if err != nil {
		return wire.UnlockWindow{}, err
	}

	var until *int64
	if vault.UnlockPeriod != nil {
		until = &state.UnlockedUntil
	}

	return wire.UnlockWindow{UnlockedUntil: until, FreshUntil: state.FreshUntil}, nil
}

func SetUnlockPeriod(o shared.Options, auth *shared.Auth, period *int64) (wire.UnlockPeriod, error) {
	_, err := shared.Transaction(o.Storage, func() (bool, error) {
		r := auth.Request
		vault, err := o.Storage.Vault(r.VaultId)
		if err != nil {
			return false, err
		}
		if vault == nil {
			return false, enverrors.New(enverrors.NotFound, "Unknown vault")
		}
		fresh := *auth
		membership, err := vaultchain.Membership(o, r.VaultId, r.Device)
		if err != nil {
			return false, err
		}

		fresh.Member = membership != nil
		if err := RequireGate(o, &fresh, "fresh"); err != nil {
			return false, err
		}

		vault.UnlockPeriod = period
		if err := o.Storage.ConfigureVault(r.VaultId, *vault, nil, nil); err != nil {
			return false, err
		}
		if period != nil {
			if err := o.Storage.CapUnlocks(r.VaultId, o.Now()+*period); err != nil {
				return false, err
			}
		}

		return true, nil
	})
	if err != nil {
		return wire.UnlockPeriod{}, err
	}

	return wire.UnlockPeriod{Period: period}, nil
}
