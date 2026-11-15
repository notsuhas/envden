package vault

import (
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func verifyHeaders(history History, first int, vaultID []byte) error {
	previous := make([]byte, 32)
	epoch := 0
	if first > 0 {
		var err error
		previous, err = crypto.ObjectHash(manifests.ManifestHeaderCodec, history.Headers[first-1], "manifest")
		if err != nil {
			return err
		}

		epoch = history.Headers[first-1].Body.Epoch
	}

	for i := first; i < len(history.Headers); i++ {
		signed := history.Headers[i]
		h := signed.Body
		at := history.States[h.ListSeq]
		if at == nil {
			return errors.New(errors.InvalidData, "Invalid device list")
		}

		signer, ok := at.Devices[encoding.Base32(h.Signer)]
		verified, err := crypto.VerifyObject(manifests.ManifestHeaderCodec, signed, signer.ObjPub, "manifest")
		if err != nil {
			return err
		}

		if !ok || !encoding.Equal(h.VaultId, vaultID) || h.Seq != uint64(i+1) || !encoding.Equal(h.Prev, previous) || !encoding.Equal(h.ListHead, at.Head) || h.Epoch != at.Epoch || h.Epoch < epoch || !verified.OK { //nolint:gosec // The index is nonnegative and bounded by the decoded entry list.
			return errors.New(errors.InvalidData, "Invalid manifest history")
		}

		previous, err = crypto.ObjectHash(manifests.ManifestHeaderCodec, signed, "manifest")
		if err != nil {
			return err
		}

		epoch = h.Epoch
	}

	earlier := map[string]bool{}
	next := 0
	for _, signed := range history.Headers {
		for next < len(history.Entries) && history.Entries[next].Body.Seq <= signed.Body.ListSeq {
			entry := history.Entries[next].Body
			if entry.Kind == 6 && !earlier[encoding.Base32(entry.Payload.(entrypayloads.RepairDone).RestoredHead)] {
				return errors.New(errors.InvalidData, "Invalid repair history")
			}

			next++
		}

		hash, err := crypto.ObjectHash(manifests.ManifestHeaderCodec, signed, "manifest")
		if err != nil {
			return err
		}

		earlier[encoding.Base32(hash)] = true
	}

	return nil
}
