package vault

import (
	"bytes"

	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/chain/repair"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	authn "github.com/notsuhas/envden/go/server/auth"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vaultchain"
)

func Commit(o shared.Options, auth *shared.Auth, swap manifests.Swap, digest []byte, mailbox *int) (adapters.CommitResult, error) {
	return shared.Transaction(o.Storage, func() (adapters.CommitResult, error) {
		r := auth.Request
		id := r.VaultId
		fresh := *auth
		membership, err := vaultchain.Membership(o, id, r.Device)
		if err != nil {
			return adapters.CommitResult{}, err
		}

		fresh.Member = membership != nil
		auth = &fresh
		stored, err := StoredSwap(swap, digest)
		if err != nil {
			return adapters.CommitResult{}, err
		}

		head, err := o.Storage.Head(id)
		if err != nil {
			return adapters.CommitResult{}, err
		}
		if head == nil {
			return adapters.CommitResult{}, enverrors.New(enverrors.Moving, "Import required")
		}
		findCommitted, err := o.Storage.FindCommitted(id, digest)
		if err != nil {
			return adapters.CommitResult{}, err
		}
		if findCommitted {
			return adapters.CommitResult{Kind: adapters.RetryOfCommitted}, nil
		}
		vault, err := o.Storage.Vault(id)
		if err != nil {
			return adapters.CommitResult{}, err
		}

		op := swap.Header.Body.Op
		if vault.ServerMoved != nil || vault.Frozen && op != 10 || !vault.Active && op != 10 {
			return adapters.CommitResult{}, enverrors.New(enverrors.Moving, "Vault moving")
		}
		if !bytes.Equal(head, swap.ExpectedHead) {
			return adapters.CommitResult{Kind: adapters.HeadMovedResult, Head: head}, nil
		}
		validate1, validate2, validate3, err := validate(o, auth, swap)
		if err != nil {
			return adapters.CommitResult{}, err
		}

		result, files, available := validate1, validate2, validate3
		if vault.Restored != nil && op != 4 && op != 11 && op != 12 {
			return adapters.CommitResult{}, enverrors.New(enverrors.RestoredMode, "Repair required")
		}
		if err := authorize(o, auth, swap, result.Authorization, &stored, mailbox); err != nil {
			return adapters.CommitResult{}, err
		}
		if err := requireUploaded(files, swap, available); err != nil {
			return adapters.CommitResult{}, err
		}
		if op == 12 {
			if err := closeRepair(o, auth, swap, &stored); err != nil {
				return adapters.CommitResult{}, err
			}
		}
		if swap.SkPub != nil {
			next := *vault
			next.SKRefused = false
			stored.Vault = &next
		}
		if op == 10 {
			next := *vault
			if !vault.Active {
				record, err := o.Storage.State(id, adapters.StateMoveSession, []byte("registration"))
				if err != nil {
					return adapters.CommitResult{}, err
				}
				if err := RequireMoveMaterial(o, id); err != nil {
					return adapters.CommitResult{}, err
				}
				if record == nil {
					return adapters.CommitResult{}, enverrors.New(enverrors.Unauthorized, "Move registration required")
				}
				stored.State = append(stored.State, adapters.StateWrite{Kind: adapters.StateOpaqueRecord, Key: []byte{}, Bytes: record}, adapters.StateWrite{Kind: adapters.StateMoveSession, Key: []byte{}}, adapters.StateWrite{Kind: adapters.StateMoveSession, Key: []byte("registration")})
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
			state, err := o.Storage.State(id, adapters.StateMoveSession, []byte{})
			if err != nil {
				return adapters.CommitResult{}, err
			}

			registrant = state
		}
		committed, err := o.Storage.CommitSwap(id, swap.ExpectedHead, stored, o.Now())
		if err != nil {
			return adapters.CommitResult{}, err
		}
		if committed.Kind == adapters.Committed && registrant != nil && (swap.OpaqueRecord != nil || !vault.Active) {
			if err := authn.RefundRegistration(o, id, registrant); err != nil {
				return adapters.CommitResult{}, err
			}
		}

		return committed, nil
	})
}

func closeRepair(o shared.Options, auth *shared.Auth, swap manifests.Swap, stored *adapters.StoredSwap) error {
	r := auth.Request
	vault, err := o.Storage.Vault(r.VaultId)
	if err != nil {
		return err
	}
	if vault.Restored == nil || len(swap.Entries) == 0 || swap.Entries[0].Body.Kind != 6 {
		return enverrors.New(enverrors.InvalidData, "Repair identity mismatch")
	}
	done := swap.Entries[0].Body.Payload.(entrypayloads.RepairDone)
	if !bytes.Equal(done.RestoredHead, vault.Restored.RestoredHead) || !bytes.Equal(done.RepairId, vault.Restored.FinishProgress) {
		return enverrors.New(enverrors.InvalidData, "Repair identity mismatch")
	}
	history, err := vaultchain.RepairHistory(o, r.VaultId)
	if err != nil {
		return err
	}

	purpose := "repair-finish"
	message := "Finishing login required"
	if repair.RepairLoginDecision(history) == "register" {
		purpose = "registration-repair"
		message = "Finishing registration required"
	}
	key := adapters.SessionKey{Kind: adapters.SessionLogin, Device: r.Device, Purpose: purpose}
	login, err := o.Storage.Session(r.VaultId, key, o.Now())
	if err != nil {
		return err
	}
	if login == nil || !bytes.Equal(login, vault.Restored.RepairTokenHash) {
		return enverrors.New(enverrors.Unauthorized, message)
	}
	stored.ConsumeSessions = append(stored.ConsumeSessions, key)
	envelope, err := o.Storage.State(r.VaultId, adapters.StateEnvelope, []byte{})
	if err != nil {
		return err
	}

	next := *vault
	next.Restored = nil
	next.SKRefused = vault.SKRefused || repair.RefuseSecretKeyProof(history, envelope != nil && bytes.Equal(crypto.H("envelope-blob", envelope), swap.Header.Body.EnvelopeHash))
	stored.Vault = &next
	stored.ClearRepairReports = true
	period := int64(2592000000)
	if vault.UnlockPeriod != nil {
		period = *vault.UnlockPeriod
	}
	stored.Devices = []adapters.StoredDeviceState{{ID: r.Device, State: adapters.StoredDevice{UnlockedUntil: o.Now() + period, FreshUntil: o.Now() + 600000, ClientVersion: r.ClientVersion}}}

	return nil
}
