package repair

import (
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/proofs"
	"github.com/notsuhas/envden/go/server/shared"
)

type RestoredVault struct {
	VaultID     []byte
	Kind, Token string
}

func RestoreKind(vault adapters.StoredVault) string {
	if vault.ServerMoved != nil {
		return "moved"
	}
	if !vault.Active {
		return "moving"
	}

	return "repair"
}

func RestoreNotice(kind string) string {
	switch kind {
	case "moving":
		return "not restored: unfinished move destination; resume or abort the move"
	case "moved":
		return "not restored: moved to another server and read-only"
	}

	return ""
}

func StartRestored(o shared.Options) ([]RestoredVault, error) {
	ids := [][]byte{}
	vaultIDs, err := o.Storage.VaultIDs()
	if err != nil {
		return nil, err
	}

	for _, id := range vaultIDs {
		headResult, err := o.Storage.Head(id)
		if err != nil {
			return nil, err
		}
		if headResult != nil {
			ids = append(ids, id)
		}
	}

	return shared.Transaction(o.Storage, func() ([]RestoredVault, error) {
		result := []RestoredVault{}
		for _, id := range ids {
			vault, err := o.Storage.Vault(id)
			if err != nil {
				return nil, err
			}

			kind := RestoreKind(*vault)
			if kind != "repair" {
				result = append(result, RestoredVault{VaultID: id, Kind: kind})
				continue
			}
			secret := crypto.RandomBytes(20)
			head, err := o.Storage.Head(id)
			if err != nil {
				return nil, err
			}
			if vault.Restored != nil {
				head = vault.Restored.RestoredHead
			}
			vault.Frozen = false
			tokenKey, err := proofs.TokenKey("repair", secret)
			if err != nil {
				return nil, err
			}

			vault.Restored = &adapters.StoredRestored{RepairTokenHash: tokenKey, RestoredHead: head, FinishProgress: crypto.H("repair-id", secret)}
			writes := []adapters.StateWrite{{Kind: adapters.StateMoveSession, Key: []byte{}}}
			states, err := o.Storage.States(id, adapters.StateRepairReport)
			if err != nil {
				return nil, err
			}

			for _, report := range states {
				writes = append(writes, adapters.StateWrite{Kind: adapters.StateRepairReport, Key: report.Key})
			}
			if err := o.Storage.ConfigureVault(id, *vault, writes, nil); err != nil {
				return nil, err
			}
			serverPin, err := keys.ServerPin(o.ServerKeys.PublicKey)
			if err != nil {
				return nil, err
			}
			encodeToken, err := proofs.EncodeToken("repair", secret, serverPin)
			if err != nil {
				return nil, err
			}

			result = append(result, RestoredVault{VaultID: id, Kind: kind, Token: encodeToken})
		}

		return result, nil
	})
}
