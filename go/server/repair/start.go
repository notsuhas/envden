package repair

import (
	a "github.com/notsuhas/envden/go/core/adapters"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	k "github.com/notsuhas/envden/go/core/protocol/keys"
	p "github.com/notsuhas/envden/go/core/protocol/proofs"
	x "github.com/notsuhas/envden/go/server/shared"
)

type RestoredVault struct {
	VaultID     []byte
	Kind, Token string
}

func RestoreKind(vault a.StoredVault) string {
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
func StartRestored(o x.Options) []RestoredVault {
	ids := [][]byte{}
	for _, id := range x.Must(o.Storage.VaultIDs()) {
		if x.Must(o.Storage.Head(id)) != nil {
			ids = append(ids, id)
		}
	}
	return x.Transaction(o.Storage, func() []RestoredVault {
		result := []RestoredVault{}
		for _, id := range ids {
			vault := x.Must(o.Storage.Vault(id))
			kind := RestoreKind(*vault)
			if kind != "repair" {
				result = append(result, RestoredVault{VaultID: id, Kind: kind})
				continue
			}
			secret := cr.RandomBytes(20)
			head := x.Must(o.Storage.Head(id))
			if vault.Restored != nil {
				head = vault.Restored.RestoredHead
			}
			vault.Frozen = false
			vault.Restored = &a.StoredRestored{RepairTokenHash: x.Must(p.TokenKey("repair", secret)), RestoredHead: head, FinishProgress: cr.H("repair-id", secret)}
			writes := []a.StateWrite{{Kind: a.StateMoveSession, Key: []byte{}}}
			for _, report := range x.Must(o.Storage.States(id, a.StateRepairReport)) {
				writes = append(writes, a.StateWrite{Kind: a.StateRepairReport, Key: report.Key})
			}
			x.Check(o.Storage.ConfigureVault(id, *vault, writes, nil))
			result = append(result, RestoredVault{VaultID: id, Kind: kind, Token: x.Must(p.EncodeToken("repair", secret, x.Must(k.ServerPin(o.ServerKeys.PublicKey))))})
		}
		return result
	})
}
