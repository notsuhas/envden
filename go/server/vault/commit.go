package vault

import (
	"bytes"
	a "github.com/notsuhas/envden/go/core/adapters"
	repair "github.com/notsuhas/envden/go/core/chain/repair"
	e "github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	authn "github.com/notsuhas/envden/go/server/auth"
	x "github.com/notsuhas/envden/go/server/shared"
	v "github.com/notsuhas/envden/go/server/vaultchain"
)

func Commit(o x.Options, auth *x.Auth, swap m.Swap, digest []byte, mailbox *int) a.CommitResult {
	return x.Transaction(o.Storage, func() a.CommitResult {
		r := auth.Request
		id := r.VaultId
		fresh := *auth
		fresh.Member = v.Membership(o, id, r.Device) != nil
		auth = &fresh
		stored := StoredSwap(swap, digest)
		head := x.Must(o.Storage.Head(id))
		if head == nil {
			x.Fail(e.Moving, "Import required")
		}
		if x.Must(o.Storage.FindCommitted(id, digest)) {
			return a.CommitResult{Kind: a.RetryOfCommitted}
		}
		vault := x.Must(o.Storage.Vault(id))
		op := swap.Header.Body.Op
		if vault.ServerMoved != nil || vault.Frozen && op != 10 || !vault.Active && op != 10 {
			x.Fail(e.Moving, "Vault moving")
		}
		if !bytes.Equal(head, swap.ExpectedHead) {
			return a.CommitResult{Kind: a.HeadMovedResult, Head: head}
		}
		result, files, available := validate(o, auth, swap)
		if vault.Restored != nil && op != 4 && op != 11 && op != 12 {
			x.Fail(e.RestoredMode, "Repair required")
		}
		authorize(o, auth, swap, result.Authorization, &stored, mailbox)
		requireUploaded(files, swap, available)
		if op == 12 {
			closeRepair(o, auth, swap, &stored)
		}
		if swap.SkPub != nil {
			next := *vault
			next.SKRefused = false
			stored.Vault = &next
		}
		if op == 10 {
			next := *vault
			if !vault.Active {
				record := x.Must(o.Storage.State(id, a.StateMoveSession, []byte("registration")))
				RequireMoveMaterial(o, id)
				if record == nil {
					x.Fail(e.Unauthorized, "Move registration required")
				}
				stored.State = append(stored.State, a.StateWrite{Kind: a.StateOpaqueRecord, Key: []byte{}, Bytes: record}, a.StateWrite{Kind: a.StateMoveSession, Key: []byte{}}, a.StateWrite{Kind: a.StateMoveSession, Key: []byte("registration")})
				next.Active = true
				next.Frozen = false
			} else {
				next.Frozen = true
				next.ServerMoved = result.State.ServerPin
			}
			stored.Vault = &next
		}
		registrant := r.Device
		if !vault.Active {
			registrant = x.Must(o.Storage.State(id, a.StateMoveSession, []byte{}))
		}
		committed := x.Must(o.Storage.CommitSwap(id, swap.ExpectedHead, stored, o.Now()))
		if committed.Kind == a.Committed && registrant != nil && (swap.OpaqueRecord != nil || !vault.Active) {
			authn.RefundRegistration(o, id, registrant)
		}
		return committed
	})
}
func closeRepair(o x.Options, auth *x.Auth, swap m.Swap, stored *a.StoredSwap) {
	r := auth.Request
	vault := x.Must(o.Storage.Vault(r.VaultId))
	if vault.Restored == nil || len(swap.Entries) == 0 || swap.Entries[0].Body.Kind != 6 {
		x.Fail(e.InvalidData, "Repair identity mismatch")
	}
	done := swap.Entries[0].Body.Payload.(p.RepairDone)
	if !bytes.Equal(done.RestoredHead, vault.Restored.RestoredHead) || !bytes.Equal(done.RepairId, vault.Restored.FinishProgress) {
		x.Fail(e.InvalidData, "Repair identity mismatch")
	}
	history := v.RepairHistory(o, r.VaultId)
	purpose := "repair-finish"
	message := "Finishing login required"
	if repair.RepairLoginDecision(history) == "register" {
		purpose = "registration-repair"
		message = "Finishing registration required"
	}
	key := a.SessionKey{Kind: a.SessionLogin, Device: r.Device, Purpose: purpose}
	login := x.Must(o.Storage.Session(r.VaultId, key, o.Now()))
	if login == nil || !bytes.Equal(login, vault.Restored.RepairTokenHash) {
		x.Fail(e.Unauthorized, message)
	}
	stored.ConsumeSessions = append(stored.ConsumeSessions, key)
	envelope := x.Must(o.Storage.State(r.VaultId, a.StateEnvelope, []byte{}))
	next := *vault
	next.Restored = nil
	next.SKRefused = vault.SKRefused || repair.RefuseSecretKeyProof(history, envelope != nil && bytes.Equal(cr.H("envelope-blob", envelope), swap.Header.Body.EnvelopeHash))
	stored.Vault = &next
	stored.ClearRepairReports = true
	period := int64(2592000000)
	if vault.UnlockPeriod != nil {
		period = *vault.UnlockPeriod
	}
	stored.Devices = []a.StoredDeviceState{{ID: r.Device, State: a.StoredDevice{UnlockedUntil: o.Now() + period, FreshUntil: o.Now() + 600000, ClientVersion: r.ClientVersion}}}
}
