package keys

import (
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/internal/validation"
)

func DeviceID(encPub, objPub, reqPub []byte) ([]byte, error) {
	return b.Try(func() []byte {
		return c.H("device-id", b.Concat(b.B32.Write(encPub), b.B32.Write(objPub), b.B32.Write(reqPub)))[:16]
	})
}

func RecoveryID(encPub, objPub []byte) ([]byte, error) {
	return b.Try(func() []byte { return c.H("recovery-id", b.Concat(b.B32.Write(encPub), b.B32.Write(objPub)))[:16] })
}

func ServerPin(pub []byte) ([]byte, error) {
	return b.Try(func() []byte {
		validation.EdPublic(pub)

		return c.H("server-pin", pub)
	})
}

func ValidateEdPublic(key []byte) error {
	_, err := b.Try(func() bool {
		validation.EdPublic(key)

		return true
	})

	return err
}

func ValidateEncPublic(key []byte) error {
	_, err := b.Try(func() bool {
		validation.EncPublic(key)

		return true
	})

	return err
}
