package vault

import (
	"bytes"

	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/chain/swaps"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	authn "github.com/notsuhas/envden/go/server/auth"
	"github.com/notsuhas/envden/go/server/pairing"
	"github.com/notsuhas/envden/go/server/shared"
)

func authorize(o shared.Options, auth *shared.Auth, swap manifests.Swap, required swaps.Authorization, stored *adapters.StoredSwap, mailbox *int) error {
	r := auth.Request
	id := r.VaultId
	vault, err := o.Storage.Vault(id)
	if err != nil {
		return err
	}

	switch required {
	case "unlocked", "fresh":
		err := authn.RequireGate(o, auth, string(required))
		if err != nil {
			return err
		}

	case "fresh-or-repair-token":
		if vault.Restored != nil {
			if err := authn.RequireRepair(o, auth); err != nil {
				return err
			}
		} else {
			if err := authn.RequireGate(o, auth, "fresh"); err != nil {
				return err
			}
		}
	case "repair-token":
		err := authn.RequireRepair(o, auth)
		if err != nil {
			return err
		}

	case "sk-proof":
		requiresGrant := !auth.Member
		if !requiresGrant {
			hasProof, err := authn.HasProof(o, auth, "sk")
			if err != nil {
				return err
			}
			requiresGrant = !hasProof
		}
		if requiresGrant {
			return enverrors.New(enverrors.Unauthorized, "Secret key proof required")
		}
	case "join-ticket":
		err := authn.RequireJoinTicket(o, auth)
		if err != nil {
			return err
		}
		if len(swap.Entries) == 0 || swap.Entries[0].Body.Kind != 1 || !bytes.Equal(swap.Entries[0].Body.Payload.(entrypayloads.AddDevice).Device.Id, r.Device) {
			return enverrors.New(enverrors.Unauthorized, "Ticket device mismatch")
		}
		stored.ConsumeSessions = []adapters.SessionKey{{Kind: adapters.SessionJoinTicket, Device: r.Device, Purpose: "kit"}}
		period := int64(2592000000)
		if vault.UnlockPeriod != nil {
			period = *vault.UnlockPeriod
		}
		stored.Devices = []adapters.StoredDeviceState{{ID: r.Device, State: adapters.StoredDevice{UnlockedUntil: o.Now() + period, ClientVersion: r.ClientVersion}}}
	case "mailbox-grant":
		if mailbox == nil || len(swap.Entries) == 0 || swap.Entries[0].Body.Kind != 1 || !bytes.Equal(swap.Entries[0].Body.Signer, r.Device) {
			return enverrors.New(enverrors.Unauthorized, "Mailbox required")
		}
		err := pairing.RequireGrant(o, auth, *mailbox)
		if err != nil {
			return err
		}

		device := swap.Entries[0].Body.Payload.(entrypayloads.AddDevice).Device.Id
		state, err := o.Storage.State(id, adapters.StateMailboxJoiner, []byte{byte((*mailbox >> 8) & 255), byte(*mailbox & 255)})
		if err != nil {
			return err
		}

		bound := state
		if bound == nil || !bytes.Equal(bound, device) {
			return enverrors.New(enverrors.Unauthorized, "Mailbox joiner mismatch")
		}
		stored.CloseMailbox = mailbox
		stored.Approver = &adapters.StoredApprover{Device: device, Bytes: *swap.Approver}
		deviceResult, err := o.Storage.Device(id, r.Device)
		if err != nil {
			return err
		}

		stored.Devices = []adapters.StoredDeviceState{{ID: device, State: adapters.StoredDevice{UnlockedUntil: deviceResult.UnlockedUntil}}}
	case "move-session":
		stateResult, err := o.Storage.State(id, adapters.StateMoveSession, []byte{})
		if err != nil {
			return err
		}

		owner := stateResult
		if !vault.Frozen || !auth.Member || owner == nil || !bytes.Equal(owner, r.Device) {
			return enverrors.New(enverrors.Unauthorized, "Move session required")
		}
	case "move-import":
		if vault.Active || !auth.Member {
			return enverrors.New(enverrors.Unauthorized, "Inactive import required")
		}
	}
	if swap.OpaqueRecord != nil {
		requireStagedRecord, err := authn.RequireStagedRecord(o, id, r.Device, *swap.OpaqueRecord)
		if err != nil {
			return err
		}

		stored.ConsumeSessions = append(stored.ConsumeSessions, requireStagedRecord)
	}

	return nil
}
