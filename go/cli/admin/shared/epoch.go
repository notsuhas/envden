package shared

import (
	"context"
	d "github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/epochs"
	"github.com/notsuhas/envden/go/core/protocol/keyring"
	"sort"
)

func NextEpoch(ctx context.Context, c *Context, h History, recovery members.RecoveryRecord, removed []byte) (d.EpochChange, []byte, error) {
	material, err := CurrentMaterial(ctx, c, h)
	if err != nil {
		return d.EpochChange{}, nil, err
	}
	key := crypto.RandomBytes(32)
	epoch := h.State.Epoch + 1
	wraps := []d.Wrap{}
	for _, id := range h.State.DeviceOrder {
		member := h.State.Devices[id]
		if b.Equal(member.Id, removed) {
			continue
		}
		w, e := epochs.SealWrap(key, c.VaultID, epoch, member.Id, member.EncPub)
		if e != nil {
			return d.EpochChange{}, nil, e
		}
		wraps = append(wraps, w)
	}
	w, err := epochs.SealWrap(key, c.VaultID, epoch, recovery.Id, recovery.EncPub)
	if err != nil {
		return d.EpochChange{}, nil, err
	}
	wraps = append(wraps, w)
	sort.Slice(wraps, func(i, j int) bool { return b.Compare(wraps[i].Recipient, wraps[j].Recipient) < 0 })
	ring := d.Keyring{VaultId: c.VaultID, Epoch: epoch, IdKey: material.Ring.IdKey, Older: append(material.Ring.Older, d.OlderKey{Epoch: material.Ring.Epoch, Key: material.Key})}
	box, err := keyring.SealKeyring(ring, key)
	if err != nil {
		return d.EpochChange{}, nil, err
	}
	commit, err := epochs.KeyCommit(key, c.VaultID, epoch)
	return d.EpochChange{Epoch: epoch, KeyCommit: commit, Wraps: wraps}, box, err
}
