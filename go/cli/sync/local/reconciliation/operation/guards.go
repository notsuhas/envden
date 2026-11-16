package operation

import (
	"crypto/sha256"
	"path/filepath"

	state "github.com/notsuhas/envden/go/cli/state/model"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func ContentHash(value []byte) *string {
	if value == nil {
		return nil
	}

	hash := sha256.Sum256(value)
	v := encoding.Base32(hash[:])

	return &v
}

func sameHash(a, b *string) bool { return a == nil && b == nil || a != nil && b != nil && *a == *b }

func CanResume(before, current []*string, next *string, written []bool) bool {
	if len(before) != len(current) {
		return false
	}

	for i, hash := range current {
		if sameHash(hash, next) {
			continue
		}

		if i < len(written) && written[i] || !sameHash(hash, before[i]) {
			return false
		}
	}

	return true
}

func OperationHashes(context *syncmodel.Context, store string, targets []state.Link) ([]*string, error) {
	stored, err := localfiles.ReadBytes(store)
	if err != nil {
		return nil, err
	}

	hashes := []*string{ContentHash(stored)}

	for _, target := range targets {
		path := filepath.Join(target.Root, target.Path)
		status, err := context.Adapters.Placement(adapters.PlacementMode(target.Mode), target.Root).Inspect(store, path)
		if err != nil {
			return nil, err
		}

		value := stored

		if status != "linked" {
			value, err = localfiles.ReadBytes(path)
			if err != nil {
				return nil, err
			}
		}

		hashes = append(hashes, ContentHash(value))
	}

	return hashes, nil
}
