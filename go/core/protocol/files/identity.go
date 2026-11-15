package files

import (
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/internal/validation"
)

func ValidatePath(path string) error {
	_, err := encoding.Try(func() bool {
		validation.Path(path)

		return true
	})

	return err
}

func FileID(key []byte, repoID, path string) ([]byte, error) {
	return encoding.Try(func() []byte {
		validation.Path(path)

		return crypto.MAC(encoding.B32.Write(key), "file-id", encoding.Concat(encoding.Str.Write(repoID), encoding.Str.Write(path)))
	})
}
