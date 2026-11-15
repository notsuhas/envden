package store

import (
	"crypto/sha256"
	"fmt"
	"path/filepath"
	"regexp"

	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/core/errors"
)

func StoreHeaders(home string, headers []string, now func() int64) ([]string, error) {
	refs := []string{}
	for _, header := range headers {
		hash := fmt.Sprintf("%x", sha256.Sum256([]byte(header)))
		path := filepath.Join(home, "state", "headers", hash)
		saved, err := files.OptionalRead(path)
		if err != nil {
			return nil, err
		}

		if saved == nil {
			if err = files.AtomicWrite(path, []byte(header), now); err != nil {
				return nil, err
			}
		}

		refs = append(refs, hash)
	}

	return refs, nil
}

func RestoreHeaders(home string, refs []string) ([]string, error) {
	headers := []string{}
	for _, hash := range refs {
		if !regexp.MustCompile(`^[a-f0-9]{64}$`).MatchString(hash) {
			return nil, errors.New(errors.InvalidData, "Invalid header reference")
		}

		header, err := files.OptionalRead(filepath.Join(home, "state", "headers", hash))
		if err != nil {
			return nil, err
		}

		if header == nil || fmt.Sprintf("%x", sha256.Sum256([]byte(*header))) != hash {
			return nil, errors.New(errors.InvalidData, "Missing stored header")
		}

		headers = append(headers, *header)
	}

	return headers, nil
}
