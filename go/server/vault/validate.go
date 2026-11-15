package vault

import (
	"github.com/notsuhas/envden/go/core/chain/swaps"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	authn "github.com/notsuhas/envden/go/server/auth"
	"github.com/notsuhas/envden/go/server/shared"
	"github.com/notsuhas/envden/go/server/vaultchain"
)

func stringID(data []byte) string { return encoding.Base32(data) }

func validate(o shared.Options, auth *shared.Auth, swap manifests.Swap) (swaps.Result, manifests.Files, map[string]bool, error) {
	id := auth.Request.VaultId
	chain1, chain2, err := vaultchain.Chain(o, id)
	if err != nil {
		return swaps.Result{}, manifests.Files{}, nil, err
	}

	previous, state := chain1, chain2
	data, err := o.Storage.FileList(id, previous.Body.FilesHash)
	if err != nil {
		return swaps.Result{}, manifests.Files{}, nil, err
	}
	if data == nil {
		return swaps.Result{}, manifests.Files{}, nil, enverrors.New(enverrors.InvalidData, "Missing head file list")
	}
	files, err := encoding.Decode(manifests.FilesCodec, data)
	if err != nil {
		return swaps.Result{}, manifests.Files{}, nil, err
	}

	old := map[string]bool{}
	for _, file := range files.Entries {
		if file.State == 1 || file.State == 3 {
			old[stringID(file.BlobHash)] = true
		}
	}
	candidates := []manifests.FileEntry{}
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
		hasBlob, err := o.Storage.HasBlob(id, file.BlobHash)
		if err != nil {
			return swaps.Result{}, manifests.Files{}, nil, err
		}
		if hasBlob {
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
			hash := entry.Body.Payload.(entrypayloads.RepairDone).RestoredHead
			header, err := o.Storage.Header(id, hash)
			if err != nil {
				return swaps.Result{}, manifests.Files{}, nil, err
			}
			if header != nil {
				ancestors[stringID(hash)] = true
			}
		}
	}
	registrationRequired, err := authn.RegistrationRequired(o, id)
	if err != nil {
		return swaps.Result{}, manifests.Files{}, nil, err
	}

	context := swaps.Context{Previous: previous, State: state, Files: files, RequestSigner: auth.Request.Device, MissingBlobs: missing, AncestorHeaderHashes: ancestors, RepairRegistrationRequired: registrationRequired}
	vault, err := o.Storage.Vault(id)
	if err != nil {
		return swaps.Result{}, manifests.Files{}, nil, err
	}
	if !vault.Active {
		serverPin, err := keys.ServerPin(o.ServerKeys.PublicKey)
		if err != nil {
			return swaps.Result{}, manifests.Files{}, nil, err
		}

		context.DestinationPin = serverPin
	}
	result, err := swaps.ValidateSwap(swap, context)
	if err != nil {
		return swaps.Result{}, manifests.Files{}, nil, err
	}
	if result.Kind != "valid" {
		return swaps.Result{}, manifests.Files{}, nil, enverrors.New(enverrors.InvalidData, "Invalid swap")
	}

	return result, files, available, nil
}

func requireUploaded(files manifests.Files, swap manifests.Swap, available map[string]bool) error {
	old := map[string]bool{}
	for _, file := range files.Entries {
		if file.State == 1 || file.State == 3 {
			old[stringID(file.BlobHash)] = true
		}
	}
	if swap.Files != nil {
		for _, file := range swap.Files.Entries {
			if (file.State == 1 || file.State == 3) && !old[stringID(file.BlobHash)] && !available[stringID(file.BlobHash)] {
				return enverrors.New(enverrors.InvalidData, "Missing uploaded blob")
			}
		}
	}

	return nil
}
