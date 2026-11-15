package vault

import (
	"bytes"
	a "github.com/notsuhas/envden/go/core/adapters"
	d "github.com/notsuhas/envden/go/core/chain/devices"
	e "github.com/notsuhas/envden/go/core/errors"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	members "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	k "github.com/notsuhas/envden/go/core/protocol/keys"
	authn "github.com/notsuhas/envden/go/server/auth"
	x "github.com/notsuhas/envden/go/server/shared"
)

func ValidCreationMaterial(swap m.Swap) bool {
	h := swap.Header.Body
	return swap.Files != nil &&
		len(swap.Files.Entries) == 0 &&
		bytes.Equal(cr.H("files", m.FilesCodec.Write(*swap.Files)), h.FilesHash) &&
		swap.Keyring != nil &&
		bytes.Equal(cr.H("keyring-blob", *swap.Keyring), h.KeyringHash) &&
		swap.Envelope != nil &&
		bytes.Equal(cr.H("envelope-blob", *swap.Envelope), h.EnvelopeHash) &&
		swap.SkPub != nil &&
		swap.OpaqueRecord != nil &&
		swap.Approver == nil
}
func ValidateCreation(swap m.Swap, id, device, pub []byte) {
	chain := x.Must(d.VerifyChain(swap.Entries))
	h := swap.Header.Body
	valid := chain.Kind == "valid" && len(swap.Entries) == 2
	if valid {
		var member members.DeviceRecord
		ok := false
		for _, key := range chain.State.DeviceOrder {
			if record, exists := chain.State.Devices[key]; exists {
				member = record
				ok = true
				break
			}
		}
		valid = ok &&
			bytes.Equal(member.Id, device) &&
			bytes.Equal(chain.State.VaultId, id) &&
			bytes.Equal(chain.State.ServerPin, x.Must(k.ServerPin(pub))) &&
			bytes.Equal(h.VaultId, id) &&
			h.Seq == 1 &&
			h.Op == 0 &&
			h.Epoch == 1 &&
			h.ListSeq == 1 &&
			bytes.Equal(h.ListHead, chain.State.Head) &&
			zero(h.Prev) &&
			zero(swap.ExpectedHead) &&
			bytes.Equal(h.Signer, device) &&
			x.Must(cr.VerifyObject(m.ManifestHeaderCodec, swap.Header, member.ObjPub, "manifest")).OK &&
			ValidCreationMaterial(swap)
	}
	if !valid {
		x.Fail(e.InvalidData, "Invalid creation")
	}
}
func Create(o x.Options, auth *x.Auth, swap m.Swap, digest []byte) a.CommitResult {
	return x.Transaction(o.Storage, func() a.CommitResult {
		r := auth.Request
		id := r.VaultId
		stored := StoredSwap(swap, digest)
		if x.Must(o.Storage.HasVault(id)) {
			if x.Must(o.Storage.FindCommitted(id, digest)) {
				return a.CommitResult{Kind: a.RetryOfCommitted}
			}
			x.Fail(e.Conflict, "Vault already exists")
		}
		if !authn.HasProof(o, auth, "setup") {
			x.Fail(e.Unauthorized, "Setup proof required")
		}
		ValidateCreation(swap, id, r.Device, o.ServerKeys.PublicKey)
		key := authn.RequireStagedRecord(o, id, r.Device, *swap.OpaqueRecord)
		authorityKey := a.SessionKey{Kind: a.SessionLogin, Device: r.Device, Purpose: "registration-authority"}
		authority := x.Must(o.Storage.Session(id, authorityKey, o.Now()))
		if authority == nil || !bytes.Equal(authority, x.Must(o.Storage.SetupToken())) {
			x.Fail(e.Unauthorized, "Registration token mismatch")
		}
		stored.ConsumeSessions = []a.SessionKey{key, authorityKey}
		stored.SetupTokenHash = x.Must(o.Storage.SetupToken())
		period := int64(2592000000)
		stored.Vault = &a.StoredVault{Active: true, UnlockPeriod: &period}
		stored.Devices = []a.StoredDeviceState{{ID: r.Device, State: a.StoredDevice{UnlockedUntil: o.Now() + period, FreshUntil: o.Now() + 600000, ClientVersion: r.ClientVersion}}}
		return x.Transaction(o.Storage, func() a.CommitResult {
			result := x.Must(o.Storage.CommitSwap(id, nil, stored, o.Now()))
			if result.Kind == a.Committed {
				authn.RefundRegistration(o, id, r.Device)
			}
			return result
		})
	})
}
