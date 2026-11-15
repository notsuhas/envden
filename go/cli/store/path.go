package store

import (
	"path/filepath"
	"strings"

	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/files"
)

func StorePath(home, repoID, path string) (string, error) {
	if err := files.ValidatePath(path); err != nil {
		return "", err
	}

	root, err := filepath.Abs(filepath.Join(home, "store", encoding.Base32(crypto.H("local-repo", []byte(repoID)))))
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
