package keys

import (
	"crypto/ed25519"
	"strings"

	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func SKSeed(secret, vaultID []byte) ([]byte, error) {
	return encoding.Try(func() []byte { return crypto.KDF(encoding.B16.Write(secret), encoding.B32.Write(vaultID), "sk-sign") })
}

func SKPub(secret, vaultID []byte) ([]byte, error) {
	return encoding.Try(func() []byte {
		return []byte(ed25519.NewKeyFromSeed(encoding.Must(SKSeed(secret, vaultID))).Public().(ed25519.PublicKey))
	})
}

func EncodeSecretKey(secret []byte) (string, error) {
	return encoding.Try(func() string {
		text := encoding.Base32(encoding.Concat(encoding.B16.Write(secret), crypto.H("sk-check", secret)[:2]))
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
	return encoding.Try(func() []byte {
		encoding.RequireValue(strings.HasPrefix(strings.ToUpper(text), "EK1-"), "Invalid secret key prefix")
		v := encoding.Must(encoding.Unbase32(strings.ReplaceAll(text[4:], "-", "")))
		encoding.RequireValue(len(v) == 18, "Invalid secret key length")
		s := v[:16]
		encoding.RequireValue(encoding.Equal(v[16:], crypto.H("sk-check", s)[:2]), "Secret key checksum")

		return s
	})
}
