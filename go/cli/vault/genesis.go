package vault

import (
	"bytes"
	"github.com/notsuhas/envden/go/cli/identity"
	p "github.com/notsuhas/envden/go/core/protocol/codecs"
	e "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	d "github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/epochs"
	"github.com/notsuhas/envden/go/core/protocol/keyring"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"sort"
)

type Genesis struct {
	VaultID, Keyring, EpochKey, IDKey []byte
	Genesis, Epoch                    b.Signed[p.Entry]
	RecoveryKeys                      keys.RecoveryKeys
}

func CreateGenesis(identity identity.Identity, pin []byte, now int64) (Genesis, error) {
	return b.Try(func() Genesis {
		r := c.RNG(nil)
		recovery := b.Must(keys.GenerateRecoveryKeys())
		rec := members.RecoveryRecord{Id: b.Must(keys.RecoveryID(recovery.EncPub, recovery.ObjPub)), EncPub: recovery.EncPub, ObjPub: recovery.ObjPub}
		genesis := b.Must(c.SignObject(p.EntryCodec, p.Entry{VaultId: make([]byte, 32), Parent: make([]byte, 32), EntryPayload: p.EntryPayload{Kind: 0, Payload: e.Genesis{ServerPin: pin, Device: identity.Record, Recovery: rec, VaultNonce: r(32), CreatedAt: uint64(now)}}, Signer: identity.Record.Id}, identity.Keys.ObjSk, "entry"))
		id := b.Must(c.ObjectHash(p.EntryCodec, genesis, "entry"))
		key := r(32)
		wraps := []d.Wrap{b.Must(epochs.SealWrap(key, id, 1, identity.Record.Id, identity.Record.EncPub)), b.Must(epochs.SealWrap(key, id, 1, rec.Id, rec.EncPub))}
		sort.Slice(wraps, func(i, j int) bool { return bytes.Compare(wraps[i].Recipient, wraps[j].Recipient) < 0 })
		epoch := b.Must(c.SignObject(p.EntryCodec, p.Entry{VaultId: id, Seq: 1, Parent: id, Signer: identity.Record.Id, EntryPayload: p.EntryPayload{Kind: 3, Payload: e.NewEpoch{Change: d.EpochChange{Epoch: 1, KeyCommit: b.Must(epochs.KeyCommit(key, id, 1)), Wraps: wraps}}}}, identity.Keys.ObjSk, "entry"))
		idKey := r(32)
		ring := b.Must(keyring.SealKeyring(d.Keyring{VaultId: id, Epoch: 1, IdKey: idKey, Older: []d.OlderKey{}}, key))
		return Genesis{id, ring, key, idKey, genesis, epoch, recovery}
	})
}
