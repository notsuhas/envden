package envelope

import (
	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"golang.org/x/crypto/argon2"
)

func PasswordKey(password string, salt []byte) ([]byte, error) {
	return encoding.Try(func() []byte {
		return argon2.IDKey([]byte(encoding.Must(encoding.NormPw(password))), encoding.B16.Write(salt), 3, 65536, 4, 32)
	})
}

func SealEnvelope(v content.Envelope, password string, secret []byte, rng ...crypto.Random) ([]byte, error) {
	return encoding.Try(func() []byte {
		r := crypto.RNG(rng)
		salt := encoding.B16.Write(r(16))
		key := crypto.KDF(encoding.Concat(encoding.Must(PasswordKey(password, salt)), encoding.B16.Write(secret)), v.VaultId, "envelope-key")
		box := encoding.Must(crypto.SealBox(key, content.EnvelopeCodec.Write(v), encoding.Concat(encoding.Ctx("envelope"), v.VaultId), r))

		return encoding.Concat(box[:1], salt, box[1:])
	})
}

func OpenEnvelope(blob []byte, password string, secret, vaultID []byte) (content.Envelope, error) {
	return encoding.Try(func() content.Envelope {
		r := &encoding.Reader{Data: blob}
		encoding.RequireValue(r.Take(1)[0] == 1)
		salt := r.Take(16)
		key := crypto.KDF(encoding.Concat(encoding.Must(PasswordKey(password, salt)), encoding.B16.Write(secret)), vaultID, "envelope-key")
		v := encoding.Must(encoding.Decode(content.EnvelopeCodec, encoding.Must(crypto.OpenBox(key, encoding.Concat([]byte{1}, r.Take(len(blob)-r.Offset)), encoding.Concat(encoding.Ctx("envelope"), vaultID)))))
		encoding.RequireValue(encoding.Equal(v.VaultId, vaultID), "Vault ID mismatch")

		return v
	})
}
