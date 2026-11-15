package files

import (
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/internal/validation"
)

func ValidatePath(path string) error {
	_, err := b.Try(func() bool {
		validation.Path(path)

		return true
	})

	return err
}

func FileID(key []byte, repoID, path string) ([]byte, error) {
	return b.Try(func() []byte {
		validation.Path(path)

		return c.MAC(b.B32.Write(key), "file-id", b.Concat(b.Str.Write(repoID), b.Str.Write(path)))
	})
}
