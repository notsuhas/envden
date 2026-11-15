package auth

import (
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
	"github.com/notsuhas/envden/go/server/shared"
)

func HasProof(o shared.Options, auth *shared.Auth, kind string) (bool, error) {
	if auth.Proof == nil {
		return false, nil
	}
	r := auth.Request
	vault, err := o.Storage.Vault(r.VaultId)
	if err != nil {
		return false, err
	}
	if kind == "sk" {
		pub, err := o.Storage.State(r.VaultId, adapters.StateSKPub, []byte{})
		if err != nil {
			return false, err
		}

		validSecretProof := (vault == nil || !vault.SKRefused) && pub != nil
		if validSecretProof {
			verifySKProof, err := proofs.VerifySKProof(pub, r, auth.Proof)
			if err != nil {
				return false, err
			}
			validSecretProof = verifySKProof.OK
		}

		return validSecretProof, nil
	}
	var key []byte
	if kind == "setup" {
		setupToken, err := o.Storage.SetupToken()
		if err != nil {
			return false, err
		}

		key = setupToken
		hasVault, err := o.Storage.HasVault(r.VaultId)
		if err != nil {
			return false, err
		}
		if hasVault {
			return false, nil
		}
	} else if vault != nil && vault.Restored != nil {
		key = vault.Restored.RepairTokenHash
	}
	validTokenProof := key != nil
	if validTokenProof {
		verifyTokenProof, err := proofs.VerifyTokenProof(kind, key, r, auth.Proof)
		if err != nil {
			return false, err
		}
		validTokenProof = verifyTokenProof.OK
	}

	return validTokenProof, nil
}
