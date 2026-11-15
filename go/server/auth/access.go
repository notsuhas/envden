package auth

import (
	"bytes"

	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/chain/repair"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vaultchain"
)

func RequireGate(o shared.Options, auth *shared.Auth, gate string) error {
	r := auth.Request
	state, err := o.Storage.Device(r.VaultId, r.Device)
	if err != nil {
		return err
	}

	vault, err := o.Storage.Vault(r.VaultId)
	if err != nil {
		return err
	}

	never := gate == "unlocked" && vault != nil && vault.UnlockPeriod == nil
	var until int64
	if state != nil {
		until = state.UnlockedUntil
		if gate == "fresh" {
			until = state.FreshUntil
		}
	}
	if !auth.Member || !never && (state == nil || o.Now() >= until) {
		return enverrors.New(enverrors.Locked, "Login required")
	}

	return nil
}

func RequireRepair(o shared.Options, auth *shared.Auth) error {
	vault, err := o.Storage.Vault(auth.Request.VaultId)
	if err != nil {
		return err
	}

	missingRepairProof := vault == nil || vault.Restored == nil
	if !missingRepairProof {
		hasProof, err := HasProof(o, auth, "repair")
		if err != nil {
			return err
		}
		missingRepairProof = !hasProof
	}
	if missingRepairProof {
		return enverrors.New(enverrors.Unauthorized, "Repair proof required")
	}

	return nil
}

func RequireMove(o shared.Options, auth *shared.Auth) error {
	r := auth.Request
	vault, err := o.Storage.Vault(r.VaultId)
	if err != nil {
		return err
	}

	owner, err := o.Storage.State(r.VaultId, adapters.StateMoveSession, []byte{})
	if err != nil {
		return err
	}
	if vault == nil || vault.Active || owner == nil || !bytes.Equal(owner, r.Device) {
		return enverrors.New(enverrors.Unauthorized, "Move session required")
	}

	return nil
}

func RequireJoinTicket(o shared.Options, auth *shared.Auth) error {
	r := auth.Request
	session, err := o.Storage.Session(r.VaultId, adapters.SessionKey{Kind: adapters.SessionJoinTicket, Device: r.Device, Purpose: "kit"}, o.Now())
	if err != nil {
		return err
	}
	if session == nil {
		return enverrors.New(enverrors.Unauthorized, "Join ticket required")
	}

	return nil
}

func Charge(o shared.Options, auth *shared.Auth) (string, error) {
	if auth.RateReceipt != "" {
		return auth.RateReceipt, nil
	}
	bucket := adapters.RateBucket{Kind: "non-member"}
	if auth.Member {
		bucket = adapters.RateBucket{Kind: "member", Device: auth.Request.Device}
	}
	result, err := o.Storage.Charge(auth.Request.VaultId, bucket, o.Now())
	if err != nil {
		return "", err
	}
	if result.Kind == "locked" {
		return "", enverrors.New(enverrors.RateLimited, "Too many attempts")
	}

	return result.Receipt, nil
}

func AuthorizeRegistration(o shared.Options, auth *shared.Auth) error {
	r := auth.Request
	vault, err := o.Storage.Vault(r.VaultId)
	if err != nil {
		return err
	}
	if vault != nil && !vault.Active {
		return RequireMove(o, auth)
	}
	requiresRepairLogin := vault != nil && vault.Restored != nil
	if requiresRepairLogin {
		registrationRequired, err := RegistrationRequired(o, r.VaultId)
		if err != nil {
			return err
		}
		requiresRepairLogin = !registrationRequired
	}
	if requiresRepairLogin {
		return enverrors.New(enverrors.Unauthorized, "Repair login required")
	}
	state, err := o.Storage.Device(r.VaultId, r.Device)
	if err != nil {
		return err
	}

	fresh := auth.Member && state != nil && o.Now() < state.FreshUntil
	if fresh {
		return nil
	}
	setup, err := HasProof(o, auth, "setup")
	if err != nil {
		return err
	}
	if setup {
		return nil
	}
	if auth.Member {
		for _, kind := range []string{"sk", "repair"} {
			verified, err := HasProof(o, auth, kind)
			if err != nil {
				return err
			}
			if verified {
				return nil
			}
		}
	}

	return enverrors.New(enverrors.Unauthorized, "Proof required")
}

func RegistrationRequired(o shared.Options, id []byte) (bool, error) {
	repairHistory, err := vaultchain.RepairHistory(o, id)
	if err != nil {
		return false, err
	}

	return repair.RepairLoginDecision(repairHistory) == "register", nil
}
