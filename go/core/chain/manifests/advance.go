package manifests

import (
	devicechain "github.com/notsuhas/envden/go/core/chain/devices"
	chainshared "github.com/notsuhas/envden/go/core/chain/shared"
	"github.com/notsuhas/envden/go/core/chain/swaps/operation"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func advanceHeader(source Source, state *devicechain.State, previous, signed encoding.Signed[manifests.ManifestHeader], known map[string]bool) (*devicechain.State, error) {
	h := signed.Body
	entries, err := EntryDescent(source, state, h)
	if err != nil {
		return nil, err
	}

	before := state
	applyEntriesResult, err := applyEntries(state, entries)
	if err != nil {
		return nil, err
	}

	state = applyEntriesResult

	signer, ok := state.Devices[chainshared.ID(h.Signer)]
	validSignature := ok
	if validSignature {
		verifyObject, err := crypto.VerifyObject(manifests.ManifestHeaderCodec, signed, signer.ObjPub, "manifest")
		if err != nil {
			return nil, err
		}
		validSignature = verifyObject.OK
	}
	if err := chainshared.Check(validSignature); err != nil {
		return nil, err
	}
	_, err = operation.OperationRequirement(previous.Body, h, entries, before)
	if err != nil {
		return nil, err
	}
	if err := chainshared.Check(h.Epoch == state.Epoch); err != nil {
		return nil, err
	}

	for _, entry := range entries {
		if entry.Body.Kind == 6 {
			if err := chainshared.Check(known[chainshared.ID(entry.Body.Payload.(entrypayloads.RepairDone).RestoredHead)]); err != nil {
				return nil, err
			}
		}
	}

	return state, nil
}

func repairChanges(c Checkpoint, previous, signed encoding.Signed[manifests.ManifestHeader], source Source) ([]manifests.FileEntry, error) {
	h := signed.Body
	if h.Op == 1 || h.Op == 11 {
		var old *manifests.Files
		if encoding.Equal(previous.Body.FilesHash, c.Header.Body.FilesHash) {
			old = &c.Files
		} else {
			files, err := source.Files(previous.Body.FilesHash)
			if err != nil {
				return nil, err
			}

			old = files
		}
		next, err := source.Files(h.FilesHash)
		if err != nil {
			return nil, err
		}
		if h.Op == 11 || (old != nil && next != nil) {
			checkedFiles, err := CheckedFiles(old, previous.Body.FilesHash)
			if err != nil {
				return nil, err
			}
			checkedFilesResult, err := CheckedFiles(next, h.FilesHash)
			if err != nil {
				return nil, err
			}
			changes, err := ChangedFiles(checkedFiles, checkedFilesResult, previous.Body.Epoch, h.Epoch, h.Op)
			if err != nil {
				return nil, err
			}
			if h.Op == 11 {
				return changes, nil
			}
		}
	}

	return nil, nil
}
