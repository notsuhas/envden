package shared

import (
	"context"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	codecsepochs "github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/epochs"
	"github.com/notsuhas/envden/go/core/protocol/keyring"
)

type Material struct {
	Key  []byte
	Ring codecsepochs.Keyring
	Keys map[int][]byte
}

func (m Material) EpochKey(epoch int) ([]byte, error) {
	key, ok := m.Keys[epoch]
	if !ok {
		return nil, errors.New(errors.InvalidData, "Vault key for an earlier epoch is missing")
	}

	return key, nil
}

func CurrentMaterial(ctx context.Context, c *Context, h History) (Material, error) {
	var result Material
	head := h.Headers[len(h.Headers)-1].Body
	var wrap *codecsepochs.Wrap
	for _, signed := range h.Entries {
		switch pld := signed.Body.Payload.(type) {
		case entrypayloads.AddDevice:
			if encoding.Equal(pld.Device.Id, c.Identity.Record.Id) {
				w := pld.Wrap
				wrap = &w
			}
		case entrypayloads.RemoveDevice:
			wrap = findWrap(pld.Change, c.Identity.Record.Id)
		case entrypayloads.NewEpoch:
			wrap = findWrap(pld.Change, c.Identity.Record.Id)
		case entrypayloads.ReplaceRecovery:
			wrap = findWrap(pld.Change, c.Identity.Record.Id)
		}
	}

	commit := h.State.Commits[head.Epoch]
	if wrap == nil || commit == nil {
		return result, errors.New(errors.Unauthorized, "Device is no longer a member")
	}

	key, err := epochs.OpenWrap(*wrap, c.Identity.Keys.EncSk, c.Identity.Record.EncPub, c.VaultID, head.Epoch, commit)
	if err != nil {
		return result, err
	}

	box, err := OptionalObject(ctx, c.Client, "/v1/keyrings/"+client.Text(head.KeyringHash))
	if err != nil {
		return result, err
	}

	if !encoding.Equal(crypto.H("keyring-blob", box), head.KeyringHash) {
		return result, errors.New(errors.InvalidData, "Keyring hash mismatch")
	}

	known, err := c.Adapters.Keychain.Get("envden/"+c.Adapters.Home+"/id-key", false)
	if err != nil {
		return result, err
	}

	ring, err := keyring.OpenKeyring(box, key, c.VaultID, head.Epoch, h.State.Commits, known)
	if err != nil {
		return result, err
	}

	keys := map[int][]byte{ring.Epoch: key}
	for _, old := range ring.Older {
		keys[old.Epoch] = old.Key
	}

	return Material{key, ring, keys}, nil
}

func findWrap(change codecsepochs.EpochChange, id []byte) *codecsepochs.Wrap {
	for _, w := range change.Wraps {
		if encoding.Equal(w.Recipient, id) {
			return &w
		}
	}

	return nil
}
