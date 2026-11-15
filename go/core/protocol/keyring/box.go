package keyring

import (
	coreprotocolcodecsepochs "github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/epochs"
)

func SealKeyring(v coreprotocolcodecsepochs.Keyring, key []byte, rng ...crypto.Random) ([]byte, error) {
	return encoding.Try(func() []byte {
		return encoding.Must(crypto.SealBox(crypto.KDF(encoding.B32.Write(key), v.VaultId, "keyring-key", encoding.U32.Write(v.Epoch)), coreprotocolcodecsepochs.KeyringCodec.Write(v), encoding.Concat(encoding.Ctx("keyring"), v.VaultId, encoding.U32.Write(v.Epoch)), rng...))
	})
}

func OpenKeyring(box, key, vaultID []byte, epoch int, commits map[int][]byte, knownIDKey []byte) (coreprotocolcodecsepochs.Keyring, error) {
	return encoding.Try(func() coreprotocolcodecsepochs.Keyring {
		v := encoding.Must(encoding.Decode(coreprotocolcodecsepochs.KeyringCodec, encoding.Must(crypto.OpenBox(crypto.KDF(encoding.B32.Write(key), encoding.B32.Write(vaultID), "keyring-key", encoding.U32.Write(epoch)), box, encoding.Concat(encoding.Ctx("keyring"), vaultID, encoding.U32.Write(epoch))))))
		encoding.RequireValue(encoding.Equal(v.VaultId, vaultID) && v.Epoch == epoch)
		if knownIDKey != nil {
			encoding.RequireValue(encoding.Equal(v.IdKey, knownIDKey), "ID key changed")
		}
		for _, k := range append(v.Older, coreprotocolcodecsepochs.OlderKey{Epoch: epoch, Key: key}) {
			expected, ok := commits[k.Epoch]
			encoding.RequireValue(ok && encoding.Equal(expected, encoding.Must(epochs.KeyCommit(k.Key, vaultID, k.Epoch))), "Epoch commit mismatch")
		}

		return v
	})
}
