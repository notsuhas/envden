package vault

import (
	swaps "github.com/notsuhas/envden/go/core/chain/swaps"
	e "github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	k "github.com/notsuhas/envden/go/core/protocol/keys"
	authn "github.com/notsuhas/envden/go/server/auth"
	x "github.com/notsuhas/envden/go/server/shared"
	v "github.com/notsuhas/envden/go/server/vaultchain"
)

func stringID(data []byte) string { return b.Base32(data) }
func validate(o x.Options, auth *x.Auth, swap m.Swap) (swaps.Result, m.Files, map[string]bool) {
	id := auth.Request.VaultId
	previous, state := v.Chain(o, id)
	data := x.Must(o.Storage.FileList(id, previous.Body.FilesHash))
	if data == nil {
		x.Fail(e.InvalidData, "Missing head file list")
	}
	files := x.Must(b.Decode(m.FilesCodec, data))
	old := map[string]bool{}
	for _, file := range files.Entries {
		if file.State == 1 || file.State == 3 {
			old[stringID(file.BlobHash)] = true
		}
	}
	candidates := []m.FileEntry{}
	if swap.Header.Body.Op == 11 {
		candidates = append(candidates, files.Entries...)
	}
	if swap.Files != nil {
		for _, file := range swap.Files.Entries {
			if swap.Header.Body.Op == 11 || !old[stringID(file.BlobHash)] {
				candidates = append(candidates, file)
			}
		}
	}
	available, checked, missing, ancestors := map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}
	for _, file := range candidates {
		key := stringID(file.BlobHash)
		if checked[key] {
			continue
		}
		checked[key] = true
		if x.Must(o.Storage.HasBlob(id, file.BlobHash)) {
			available[key] = true
		}
	}
	for _, file := range files.Entries {
		if !available[stringID(file.BlobHash)] {
			missing[stringID(file.BlobHash)] = true
		}
	}
	for _, entry := range swap.Entries {
		if entry.Body.Kind == 6 {
			hash := entry.Body.Payload.(p.RepairDone).RestoredHead
			if x.Must(o.Storage.Header(id, hash)) != nil {
				ancestors[stringID(hash)] = true
			}
		}
	}
	context := swaps.Context{Previous: previous, State: state, Files: files, RequestSigner: auth.Request.Device, MissingBlobs: missing, AncestorHeaderHashes: ancestors, RepairRegistrationRequired: authn.RegistrationRequired(o, id)}
	if !x.Must(o.Storage.Vault(id)).Active {
		context.DestinationPin = x.Must(k.ServerPin(o.ServerKeys.PublicKey))
	}
	result := x.Must(swaps.ValidateSwap(swap, context))
	if result.Kind != "valid" {
		x.Fail(e.InvalidData, "Invalid swap")
	}
	return result, files, available
}
func requireUploaded(files m.Files, swap m.Swap, available map[string]bool) {
	old := map[string]bool{}
	for _, file := range files.Entries {
		if file.State == 1 || file.State == 3 {
			old[stringID(file.BlobHash)] = true
		}
	}
	if swap.Files != nil {
		for _, file := range swap.Files.Entries {
			if (file.State == 1 || file.State == 3) && !old[stringID(file.BlobHash)] && !available[stringID(file.BlobHash)] {
				x.Fail(e.InvalidData, "Missing uploaded blob")
			}
		}
	}
}
