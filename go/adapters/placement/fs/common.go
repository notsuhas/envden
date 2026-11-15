package fs

import (
	"github.com/google/uuid"
	"github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
)

type placement struct {
	mode          adapters.PlacementMode
	root, backups string
	now           func() int64
}

func CreateFsPlacementAdapter(mode adapters.PlacementMode, root string, conflictsDir string, now func() int64) adapters.Placement {
	root, _ = filepath.Abs(root)
	return &placement{mode, root, conflictsDir, now}
}

func (p *placement) Mode() adapters.PlacementMode { return p.mode }

func (p *placement) Supported(dir string) (bool, error) {
	if p.mode == adapters.PlacementCopy {
		return true, nil
	}
	path := filepath.Join(dir, ".envden-probe-"+uuid.NewString())
	err := os.Symlink(".envden-probe-target", path)
	defer os.Remove(path)
	return err == nil, nil
}

func failure(err *error) {
	if *err != nil {
		if _, ok := e.As(*err); !ok {
			*err = e.Wrap("CONFLICT", "Placement operation failed", *err)
		}
	}
}

func sameTarget(target, store string) bool {
	a, _ := filepath.Abs(target)
	b, _ := filepath.Abs(store)
	if a == b {
		return true
	}
	a, err := filepath.EvalSymlinks(target)
	if err != nil {
		return false
	}
	b, err = filepath.EvalSymlinks(store)
	return err == nil && a == b
}

func resolveLink(parent, target string) string {
	if filepath.IsAbs(target) {
		return target
	}
	return filepath.Join(parent, target)
}
