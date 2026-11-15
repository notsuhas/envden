package vault

import (
	"github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func verifyHeaders(history History, first int, vaultID []byte) error {
	previous := make([]byte, 32)
	epoch := 0
	if first > 0 {
		var err error
		previous, err = c.ObjectHash(m.ManifestHeaderCodec, history.Headers[first-1], "manifest")
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
		signer, ok := at.Devices[b.Base32(h.Signer)]
		verified, err := c.VerifyObject(m.ManifestHeaderCodec, signed, signer.ObjPub, "manifest")
		if err != nil {
			return err
		}
		if !ok || !b.Equal(h.VaultId, vaultID) || h.Seq != uint64(i+1) || !b.Equal(h.Prev, previous) || !b.Equal(h.ListHead, at.Head) || h.Epoch != at.Epoch || h.Epoch < epoch || !verified.OK {
			return errors.New(errors.InvalidData, "Invalid manifest history")
		}
		previous, err = c.ObjectHash(m.ManifestHeaderCodec, signed, "manifest")
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
			if entry.Kind == 6 && !earlier[b.Base32(entry.Payload.(p.RepairDone).RestoredHead)] {
				return errors.New(errors.InvalidData, "Invalid repair history")
			}
			next++
		}
		hash, err := c.ObjectHash(m.ManifestHeaderCodec, signed, "manifest")
		if err != nil {
			return err
		}
		earlier[b.Base32(hash)] = true
	}
	return nil
}
