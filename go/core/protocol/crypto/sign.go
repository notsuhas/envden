package crypto

import (
	"bytes"
	"crypto/ed25519"

	"filippo.io/edwards25519"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/internal/validation"
)

type Verification[T any] struct {
	OK     bool
	Value  T
	Reason string
}

func Sign(sk []byte, label string, message []byte) ([]byte, error) {
	return encoding.Try(func() []byte {
		return ed25519.Sign(ed25519.NewKeyFromSeed(encoding.B32.Write(sk)), Frame(label, message))
	})
}

func Verify(pub []byte, label string, message, signature []byte) Verification[bool] {
	_, err := encoding.Try(func() bool {
		validation.EdPublic(pub)
		encoding.B64.Write(signature)
		r, e := new(edwards25519.Point).SetBytes(signature[:32])
		encoding.RequireValue(e == nil && bytes.Equal(r.Bytes(), signature[:32]), "Bad signature")
		encoding.RequireValue(ed25519.Verify(pub, Frame(label, message), signature), "Bad signature")

		return true
	})
	if err != nil {
		return Verification[bool]{Reason: "Invalid signature"}
	}

	return Verification[bool]{OK: true, Value: true}
}
