package envelope

import (
	d "github.com/notsuhas/envden/go/core/protocol/codecs/content"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"golang.org/x/crypto/argon2"
)

func PasswordKey(password string, salt []byte) ([]byte, error) {
	return b.Try(func() []byte {
		return argon2.IDKey([]byte(b.Must(b.NormPw(password))), b.B16.Write(salt), 3, 65536, 4, 32)
	})
}

func SealEnvelope(v d.Envelope, password string, secret []byte, rng ...c.Random) ([]byte, error) {
	return b.Try(func() []byte {
		r := c.RNG(rng)
		salt := b.B16.Write(r(16))
		key := c.KDF(b.Concat(b.Must(PasswordKey(password, salt)), b.B16.Write(secret)), v.VaultId, "envelope-key")
		box := b.Must(c.SealBox(key, d.EnvelopeCodec.Write(v), b.Concat(b.Ctx("envelope"), v.VaultId), r))

		return b.Concat(box[:1], salt, box[1:])
	})
}

func OpenEnvelope(blob []byte, password string, secret, vaultID []byte) (d.Envelope, error) {
	return b.Try(func() d.Envelope {
		r := &b.Reader{Data: blob}
		b.RequireValue(r.Take(1)[0] == 1)
		salt := r.Take(16)
		key := c.KDF(b.Concat(b.Must(PasswordKey(password, salt)), b.B16.Write(secret)), vaultID, "envelope-key")
		v := b.Must(b.Decode(d.EnvelopeCodec, b.Must(c.OpenBox(key, b.Concat([]byte{1}, r.Take(len(blob)-r.Offset)), b.Concat(b.Ctx("envelope"), vaultID)))))
		b.RequireValue(b.Equal(v.VaultId, vaultID), "Vault ID mismatch")

		return v
	})
}
