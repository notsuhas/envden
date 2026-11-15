package keyring

import (
	d "github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/epochs"
)

func SealKeyring(v d.Keyring, key []byte, rng ...c.Random) ([]byte, error) {
	return b.Try(func() []byte {
		return b.Must(c.SealBox(c.KDF(b.B32.Write(key), v.VaultId, "keyring-key", b.U32.Write(v.Epoch)), d.KeyringCodec.Write(v), b.Concat(b.Ctx("keyring"), v.VaultId, b.U32.Write(v.Epoch)), rng...))
	})
}

func OpenKeyring(box, key, vaultID []byte, epoch int, commits map[int][]byte, knownIDKey []byte) (d.Keyring, error) {
	return b.Try(func() d.Keyring {
		v := b.Must(b.Decode(d.KeyringCodec, b.Must(c.OpenBox(c.KDF(b.B32.Write(key), b.B32.Write(vaultID), "keyring-key", b.U32.Write(epoch)), box, b.Concat(b.Ctx("keyring"), vaultID, b.U32.Write(epoch))))))
		b.RequireValue(b.Equal(v.VaultId, vaultID) && v.Epoch == epoch)
		if knownIDKey != nil {
			b.RequireValue(b.Equal(v.IdKey, knownIDKey), "ID key changed")
		}
		for _, k := range append(v.Older, d.OlderKey{Epoch: epoch, Key: key}) {
			expected, ok := commits[k.Epoch]
			b.RequireValue(ok && b.Equal(expected, b.Must(epochs.KeyCommit(k.Key, vaultID, k.Epoch))), "Epoch commit mismatch")
		}
		return v
	})
}
