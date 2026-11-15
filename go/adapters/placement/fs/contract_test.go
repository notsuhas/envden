package fs_test

import (
	fs "github.com/notsuhas/envden/go/adapters/placement/fs"
	a "github.com/notsuhas/envden/go/core/adapters"
	p "github.com/notsuhas/envden/go/testing/placement"
	"testing"
)

func TestContract(t *testing.T) {
	for _, mode := range []a.PlacementMode{a.PlacementLink, a.PlacementCopy} {
		t.Run(string(mode), func(t *testing.T) {
			p.PlacementContract(t, func(root, backups string) a.Placement {
				return fs.CreateFsPlacementAdapter(mode, root, backups, func() int64 { return 1000 })
			})
		})
	}
}
