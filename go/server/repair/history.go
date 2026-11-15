package repair

import (
	"bytes"
	a "github.com/notsuhas/envden/go/core/adapters"
	d "github.com/notsuhas/envden/go/core/chain/devices"
	cm "github.com/notsuhas/envden/go/core/chain/manifests"
	swaps "github.com/notsuhas/envden/go/core/chain/swaps"
	e "github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	x "github.com/notsuhas/envden/go/server/shared"
	vault "github.com/notsuhas/envden/go/server/vault"
	v "github.com/notsuhas/envden/go/server/vaultchain"
)

func UploadHistory(o x.Options, auth *x.Auth, swap m.Swap, digest []byte, checkUploader bool) a.CommitResult {
	id := auth.Request.VaultId
	stored := vault.StoredSwap(swap, digest)
	metadata := x.Must(o.Storage.Vault(id))
	writes := []a.StateWrite{}
	for _, write := range stored.State {
		if write.Kind != a.StateOpaqueRecord && (metadata.Restored == nil || write.Kind != a.StateSKPub) {
			writes = append(writes, write)
		}
	}
	stored.State = writes
	head := x.Must(o.Storage.Head(id))
	if head != nil && x.Must(o.Storage.FindCommitted(id, digest)) {
		return a.CommitResult{Kind: a.RetryOfCommitted}
	}
	if head == nil {
		verifyGenesis(o, auth, swap, checkUploader)
		return x.Must(o.Storage.CommitSwap(id, nil, stored, o.Now()))
	}
	verifyHistory(o, auth, swap, checkUploader)
	return x.Must(o.Storage.CommitSwap(id, swap.ExpectedHead, stored, o.Now()))
}
func verifyGenesis(o x.Options, auth *x.Auth, swap m.Swap, check bool) {
	result := x.Must(d.VerifyChain(swap.Entries))
	h := swap.Header.Body
	id := auth.Request.VaultId
	valid := result.Kind == "valid"
	if valid {
		member, ok := result.State.Devices[b.Base32(h.Signer)]
		_, uploader := result.State.Devices[b.Base32(auth.Request.Device)]
		valid = ok &&
			(!check || x.Must(o.Storage.Vault(id)).Restored == nil || uploader) &&
			bytes.Equal(result.State.VaultId, id) &&
			bytes.Equal(h.VaultId, id) &&
			h.Op == 0 &&
			h.Seq == 1 &&
			h.ListSeq == 1 &&
			bytes.Equal(h.ListHead, result.State.Head) &&
			h.Epoch == 1 &&
			zero(h.Prev) &&
			zero(swap.ExpectedHead) &&
			swap.Files != nil &&
			len(swap.Files.Entries) == 0 &&
			bytes.Equal(cr.H("files", m.FilesCodec.Write(*swap.Files)), h.FilesHash) &&
			(swap.Keyring == nil || bytes.Equal(cr.H("keyring-blob", *swap.Keyring), h.KeyringHash)) &&
			(swap.Envelope == nil || bytes.Equal(cr.H("envelope-blob", *swap.Envelope), h.EnvelopeHash)) &&
			x.Must(cr.VerifyObject(m.ManifestHeaderCodec, swap.Header, member.ObjPub, "manifest")).OK
	}
	if !valid {
		x.Fail(e.InvalidData, "Invalid imported genesis")
	}
}
func zero(data []byte) bool {
	for _, n := range data {
		if n != 0 {
			return false
		}
	}
	return true
}
func verifyHistory(o x.Options, auth *x.Auth, swap m.Swap, check bool) {
	id := auth.Request.VaultId
	previous, before := v.Chain(o, id)
	state := before
	h := swap.Header.Body
	if !bytes.Equal(swap.ExpectedHead, x.Must(cr.ObjectHash(m.ManifestHeaderCodec, previous, "manifest"))) || !bytes.Equal(h.Prev, swap.ExpectedHead) || h.Seq != previous.Body.Seq+1 || !bytes.Equal(h.VaultId, id) {
		x.Fail(e.InvalidData, "History linkage mismatch")
	}
	for _, entry := range swap.Entries {
		result := x.Must(d.ApplyEntry(state, entry))
		if result.Kind != "valid" {
			x.Fail(e.InvalidData, "Invalid history entry")
		}
		state = result.State
	}
	signer, ok := state.Devices[b.Base32(h.Signer)]
	_, uploader := state.Devices[b.Base32(auth.Request.Device)]
	if !ok || !x.Must(cr.VerifyObject(m.ManifestHeaderCodec, swap.Header, signer.ObjPub, "manifest")).OK || h.ListSeq != state.Seq || !bytes.Equal(h.ListHead, state.Head) || h.Epoch != state.Epoch || check &&
		x.Must(o.Storage.Vault(id)).Restored != nil &&
		!uploader {
		x.Fail(e.InvalidData, "Invalid history header")
	}
	transition(o, swap, previous, before, id)
}
func transition(o x.Options, swap m.Swap, previous b.Signed[m.ManifestHeader], before *d.State, id []byte) {
	defer func() {
		if recover() != nil {
			x.Fail(e.InvalidData, "Invalid history transition")
		}
	}()
	h := swap.Header.Body
	x.Must(swaps.OperationRequirement(previous.Body, h, swap.Entries, before))
	if len(swap.Entries) > 0 && swap.Entries[0].Body.Kind == 6 && x.Must(o.Storage.Header(id, swap.Entries[0].Body.Payload.(p.RepairDone).RestoredHead)) == nil {
		x.Fail(e.InvalidData, "Unknown restored ancestor")
	}
	old := []byte(nil)
	if swap.Files != nil {
		x.Must(cm.CheckedFiles(swap.Files, h.FilesHash))
		old = x.Must(o.Storage.FileList(id, previous.Body.FilesHash))
		if old != nil {
			ops := []int{}
			if h.Op == 1 || h.Op == 11 {
				ops = append(ops, h.Op)
			}
			x.Must(cm.ChangedFiles(x.Must(b.Decode(m.FilesCodec, old)), *swap.Files, previous.Body.Epoch, h.Epoch, ops...))
		}
	}
	if h.Op == 11 && (swap.Files == nil || old == nil) {
		x.Fail(e.InvalidData, "Repair lists required")
	}
	if swap.Keyring != nil && !bytes.Equal(cr.H("keyring-blob", *swap.Keyring), h.KeyringHash) {
		x.Fail(e.InvalidData, "Keyring hash mismatch")
	}
	if swap.Envelope != nil && !bytes.Equal(cr.H("envelope-blob", *swap.Envelope), h.EnvelopeHash) {
		x.Fail(e.InvalidData, "Envelope hash mismatch")
	}
}
func UploadChain(o x.Options, auth *x.Auth, swaps []m.Swap) a.CommitResult {
	if len(swaps) == 0 {
		x.Fail(e.InvalidInput, "Empty history")
	}
	return x.Transaction(o.Storage, func() a.CommitResult {
		var result a.CommitResult
		for _, swap := range swaps {
			result = UploadHistory(o, auth, swap, cr.H("swap", m.SwapCodec.Write(swap)), false)
			if result.Kind == a.HeadMovedResult {
				x.Fail(e.HeadMoved, "History head moved")
			}
		}
		if x.Must(o.Storage.Vault(auth.Request.VaultId)).Restored != nil && v.Membership(o, auth.Request.VaultId, auth.Request.Device) == nil {
			x.Fail(e.NotMember, "Uploader not a repaired member")
		}
		return result
	})
}
