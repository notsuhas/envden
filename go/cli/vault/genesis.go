package vault

import (
	"bytes"
	"sort"

	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	codecsepochs "github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/epochs"
	"github.com/notsuhas/envden/go/core/protocol/keyring"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

type Genesis struct {
	VaultID, Keyring, EpochKey, IDKey []byte
	Genesis, Epoch                    encoding.Signed[codecs.Entry]
	RecoveryKeys                      keys.RecoveryKeys
}

func CreateGenesis(identity identity.Identity, pin []byte, now int64) (Genesis, error) {
	return encoding.Try(func() Genesis {
		r := crypto.RNG(nil)
		recovery := encoding.Must(keys.GenerateRecoveryKeys())
		rec := members.RecoveryRecord{Id: encoding.Must(keys.RecoveryID(recovery.EncPub, recovery.ObjPub)), EncPub: recovery.EncPub, ObjPub: recovery.ObjPub}
		genesis := encoding.Must(crypto.SignObject(codecs.EntryCodec, codecs.Entry{VaultId: make([]byte, 32), Parent: make([]byte, 32), EntryPayload: codecs.EntryPayload{Kind: 0, Payload: entrypayloads.Genesis{ServerPin: pin, Device: identity.Record, Recovery: rec, VaultNonce: r(32), CreatedAt: uint64(now)}}, Signer: identity.Record.Id}, identity.Keys.ObjSk, "entry")) //nolint:gosec // Unix millisecond clock values are nonnegative.
		id := encoding.Must(crypto.ObjectHash(codecs.EntryCodec, genesis, "entry"))
		key := r(32)
		wraps := []codecsepochs.Wrap{encoding.Must(epochs.SealWrap(key, id, 1, identity.Record.Id, identity.Record.EncPub)), encoding.Must(epochs.SealWrap(key, id, 1, rec.Id, rec.EncPub))}
		sort.Slice(wraps, func(i, j int) bool { return bytes.Compare(wraps[i].Recipient, wraps[j].Recipient) < 0 })
		epoch := encoding.Must(crypto.SignObject(codecs.EntryCodec, codecs.Entry{VaultId: id, Seq: 1, Parent: id, Signer: identity.Record.Id, EntryPayload: codecs.EntryPayload{Kind: 3, Payload: entrypayloads.NewEpoch{Change: codecsepochs.EpochChange{Epoch: 1, KeyCommit: encoding.Must(epochs.KeyCommit(key, id, 1)), Wraps: wraps}}}}, identity.Keys.ObjSk, "entry"))
		idKey := r(32)
		ring := encoding.Must(keyring.SealKeyring(codecsepochs.Keyring{VaultId: id, Epoch: 1, IdKey: idKey, Older: []codecsepochs.OlderKey{}}, key))

		return Genesis{id, ring, key, idKey, genesis, epoch, recovery}
	})
}
