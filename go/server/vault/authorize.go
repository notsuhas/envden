package vault

import (
	"bytes"
	a "github.com/notsuhas/envden/go/core/adapters"
	swaps "github.com/notsuhas/envden/go/core/chain/swaps"
	e "github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	authn "github.com/notsuhas/envden/go/server/auth"
	pairing "github.com/notsuhas/envden/go/server/pairing"
	x "github.com/notsuhas/envden/go/server/shared"
)

func authorize(o x.Options, auth *x.Auth, swap m.Swap, required swaps.Authorization, stored *a.StoredSwap, mailbox *int) {
	r := auth.Request
	id := r.VaultId
	vault := x.Must(o.Storage.Vault(id))
	switch required {
	case "unlocked", "fresh":
		authn.RequireGate(o, auth, string(required))
	case "fresh-or-repair-token":
		if vault.Restored != nil {
			authn.RequireRepair(o, auth)
		} else {
			authn.RequireGate(o, auth, "fresh")
		}
	case "repair-token":
		authn.RequireRepair(o, auth)
	case "sk-proof":
		if !auth.Member || !authn.HasProof(o, auth, "sk") {
			x.Fail(e.Unauthorized, "Secret key proof required")
		}
	case "join-ticket":
		authn.RequireJoinTicket(o, auth)
		if len(swap.Entries) == 0 || swap.Entries[0].Body.Kind != 1 || !bytes.Equal(swap.Entries[0].Body.Payload.(p.AddDevice).Device.Id, r.Device) {
			x.Fail(e.Unauthorized, "Ticket device mismatch")
		}
		stored.ConsumeSessions = []a.SessionKey{{Kind: a.SessionJoinTicket, Device: r.Device, Purpose: "kit"}}
		period := int64(2592000000)
		if vault.UnlockPeriod != nil {
			period = *vault.UnlockPeriod
		}
		stored.Devices = []a.StoredDeviceState{{ID: r.Device, State: a.StoredDevice{UnlockedUntil: o.Now() + period, ClientVersion: r.ClientVersion}}}
	case "mailbox-grant":
		if mailbox == nil || len(swap.Entries) == 0 || swap.Entries[0].Body.Kind != 1 || !bytes.Equal(swap.Entries[0].Body.Signer, r.Device) {
			x.Fail(e.Unauthorized, "Mailbox required")
		}
		pairing.RequireGrant(o, auth, *mailbox)
		device := swap.Entries[0].Body.Payload.(p.AddDevice).Device.Id
		bound := x.Must(o.Storage.State(id, a.StateMailboxJoiner, []byte{byte(*mailbox >> 8), byte(*mailbox)}))
		if bound == nil || !bytes.Equal(bound, device) {
			x.Fail(e.Unauthorized, "Mailbox joiner mismatch")
		}
		stored.CloseMailbox = mailbox
		stored.Approver = &a.StoredApprover{Device: device, Bytes: *swap.Approver}
		stored.Devices = []a.StoredDeviceState{{ID: device, State: a.StoredDevice{UnlockedUntil: x.Must(o.Storage.Device(id, r.Device)).UnlockedUntil}}}
	case "move-session":
		owner := x.Must(o.Storage.State(id, a.StateMoveSession, []byte{}))
		if !vault.Frozen || !auth.Member || owner == nil || !bytes.Equal(owner, r.Device) {
			x.Fail(e.Unauthorized, "Move session required")
		}
	case "move-import":
		if vault.Active || !auth.Member {
			x.Fail(e.Unauthorized, "Inactive import required")
		}
	}
	if swap.OpaqueRecord != nil {
		stored.ConsumeSessions = append(stored.ConsumeSessions, authn.RequireStagedRecord(o, id, r.Device, *swap.OpaqueRecord))
	}
}
