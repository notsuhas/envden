package keys

import (
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/internal/validation"
)

func DeviceID(encPub, objPub, reqPub []byte) ([]byte, error) {
	return encoding.Try(func() []byte {
		return crypto.H("device-id", encoding.Concat(encoding.B32.Write(encPub), encoding.B32.Write(objPub), encoding.B32.Write(reqPub)))[:16]
	})
}

func RecoveryID(encPub, objPub []byte) ([]byte, error) {
	return encoding.Try(func() []byte {
		return crypto.H("recovery-id", encoding.Concat(encoding.B32.Write(encPub), encoding.B32.Write(objPub)))[:16]
	})
}

func ServerPin(pub []byte) ([]byte, error) {
	return encoding.Try(func() []byte {
		validation.EdPublic(pub)

		return crypto.H("server-pin", pub)
	})
}

func ValidateEdPublic(key []byte) error {
	_, err := encoding.Try(func() bool {
		validation.EdPublic(key)

		return true
	})

	return err
}

func ValidateEncPublic(key []byte) error {
	_, err := encoding.Try(func() bool {
		validation.EncPublic(key)

		return true
	})

	return err
}
