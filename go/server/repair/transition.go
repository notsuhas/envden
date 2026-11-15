package repair

import (
	"bytes"

	devicechain "github.com/notsuhas/envden/go/core/chain/devices"
	manifestchain "github.com/notsuhas/envden/go/core/chain/manifests"
	"github.com/notsuhas/envden/go/core/chain/swaps"
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/server/shared"
)

func transition(o shared.Options, swap manifests.Swap, previous encoding.Signed[manifests.ManifestHeader], before *devicechain.State, id []byte) (err error) {
	defer func() {
		if err != nil {
			err = enverrors.New(enverrors.InvalidData, "Invalid history transition")
		}
	}()
	h := swap.Header.Body
	if _, err := swaps.OperationRequirement(previous.Body, h, swap.Entries, before); err != nil {
		return err
	}

	hasRepairEntry := len(swap.Entries) > 0 && swap.Entries[0].Body.Kind == 6
	if hasRepairEntry {
		header, err := o.Storage.Header(id, swap.Entries[0].Body.Payload.(entrypayloads.RepairDone).RestoredHead)
		if err != nil {
			return err
		}
		hasRepairEntry = header == nil
	}
	if hasRepairEntry {
		return enverrors.New(enverrors.InvalidData, "Unknown restored ancestor")
	}
	old := []byte(nil)
	if swap.Files != nil {
		if _, err := manifestchain.CheckedFiles(swap.Files, h.FilesHash); err != nil {
			return err
		}

		fileList, err := o.Storage.FileList(id, previous.Body.FilesHash)
		if err != nil {
			return err
		}

		old = fileList
		if old != nil {
			ops := []int{}
			if h.Op == 1 || h.Op == 11 {
				ops = append(ops, h.Op)
			}
			files, err := encoding.Decode(manifests.FilesCodec, old)
			if err != nil {
				return err
			}
			_, err = manifestchain.ChangedFiles(files, *swap.Files, previous.Body.Epoch, h.Epoch, ops...)
			if err != nil {
				return err
			}
		}
	}
	if h.Op == 11 && (swap.Files == nil || old == nil) {
		return enverrors.New(enverrors.InvalidData, "Repair lists required")
	}
	if swap.Keyring != nil && !bytes.Equal(crypto.H("keyring-blob", *swap.Keyring), h.KeyringHash) {
		return enverrors.New(enverrors.InvalidData, "Keyring hash mismatch")
	}
	if swap.Envelope != nil && !bytes.Equal(crypto.H("envelope-blob", *swap.Envelope), h.EnvelopeHash) {
		return enverrors.New(enverrors.InvalidData, "Envelope hash mismatch")
	}

	return nil
}
