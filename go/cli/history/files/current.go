package files

import (
	"bytes"
	"github.com/notsuhas/envden/go/cli/contracts"
	sf "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/core/adapters"
	"path/filepath"
)

func ReadBytes(path string) ([]byte, error) { return sf.ReadBytes(path) }

func CheckoutBytes(a contracts.Adapters, t Target) ([]byte, bool, error) {
	destination := filepath.Join(t.Root, t.Path)
	if t.Link == nil || t.Link.Mode != "link" {
		data, err := ReadBytes(destination)
		return data, false, err
	}
	status, err := a.Placement(adapters.PlacementLink, t.Root).Inspect(t.Link.Store, destination)
	if err != nil {
		return nil, false, err
	}
	stored, err := ReadBytes(t.Link.Store)
	if err != nil {
		return nil, false, err
	}
	if status != adapters.PlacementDetached {
		return stored, false, nil
	}
	placed, err := ReadBytes(destination)
	return placed, !(bytes.Equal(placed, stored) && (placed == nil) == (stored == nil)), err
}
