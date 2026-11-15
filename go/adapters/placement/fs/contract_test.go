package fs_test

import (
	"testing"

	adaptersplacementfs "github.com/notsuhas/envden/go/adapters/placement/fs"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/testing/placement"
)

func TestContract(t *testing.T) {
	for _, mode := range []adapters.PlacementMode{adapters.PlacementLink, adapters.PlacementCopy} {
		t.Run(string(mode), func(t *testing.T) {
			placement.PlacementContract(t, func(root, backups string) adapters.Placement {
				return adaptersplacementfs.CreateFsPlacementAdapter(mode, root, backups, func() int64 { return 1000 })
			})
		})
	}
}
