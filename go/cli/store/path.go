package store

import (
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/files"
	"path/filepath"
	"strings"
)

func StorePath(home, repoID, path string) (string, error) {
	if err := files.ValidatePath(path); err != nil {
		return "", err
	}
	root, err := filepath.Abs(filepath.Join(home, "store", b.Base32(crypto.H("local-repo", []byte(repoID)))))
	if err != nil {
		return "", err
	}
	result := filepath.Join(root, path)
	rel, err := filepath.Rel(root, result)
	if err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
		return "", errors.New(errors.InvalidInput, "Unsafe store path")
	}
	return result, nil
}
