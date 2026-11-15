package keys

import (
	"crypto/ed25519"
	"strings"

	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func SKSeed(secret, vaultID []byte) ([]byte, error) {
	return b.Try(func() []byte { return c.KDF(b.B16.Write(secret), b.B32.Write(vaultID), "sk-sign") })
}

func SKPub(secret, vaultID []byte) ([]byte, error) {
	return b.Try(func() []byte {
		return []byte(ed25519.NewKeyFromSeed(b.Must(SKSeed(secret, vaultID))).Public().(ed25519.PublicKey))
	})
}

func EncodeSecretKey(secret []byte) (string, error) {
	return b.Try(func() string {
		text := b.Base32(b.Concat(b.B16.Write(secret), c.H("sk-check", secret)[:2]))
		parts := []string{}
		for len(text) > 5 {
			parts = append(parts, text[:5])
			text = text[5:]
		}
		parts = append(parts, text)

		return "EK1-" + strings.Join(parts, "-")
	})
}

func DecodeSecretKey(text string) ([]byte, error) {
	return b.Try(func() []byte {
		b.RequireValue(strings.HasPrefix(strings.ToUpper(text), "EK1-"), "Invalid secret key prefix")
		v := b.Must(b.Unbase32(strings.ReplaceAll(text[4:], "-", "")))
		b.RequireValue(len(v) == 18, "Invalid secret key length")
		s := v[:16]
		b.RequireValue(b.Equal(v[16:], c.H("sk-check", s)[:2]), "Secret key checksum")

		return s
	})
}
