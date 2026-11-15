package history

import (
	"path/filepath"

	state "github.com/notsuhas/envden/go/cli/state/model"
	f "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/content"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/adapters"
)

type Snapshot struct {
	content.Copy
	Target   state.Link
	UseStore bool
}

func FileSnapshot(context *sm.Context, target state.Link, stored, applied []byte) (Snapshot, error) {
	destination := filepath.Join(target.Root, target.Path)
	status, err := context.Adapters.Placement(adapters.PlacementMode(target.Mode), target.Root).Inspect(target.Store, destination)
	if err != nil {
		return Snapshot{}, err
	}
	tracked := false
	for _, item := range context.State.Links {
		if item.Root == target.Root && item.Path == target.Path {
			tracked = true
			break
		}
	}
	root := ""
	if target.Mode == "copy" {
		root = target.Root
	}
	base := f.BasePath(context.Adapters.Home, target.Store, root)
	useStore := target.Mode == "link" && status != "detached"
	value := stored
	if !useStore {
		value, err = f.ReadBytes(destination)
		if err != nil {
			return Snapshot{}, err
		}
	}
	previous, err := f.ReadBytes(base)
	if err != nil {
		return Snapshot{}, err
	}
	detached := target.Mode == "link" && status == "detached" && !f.Same(value, stored) && (!tracked || !f.Same(stored, previous))

	return Snapshot{Copy: content.Copy{Bytes: value, Base: previous, Tracked: tracked, Detached: detached, Mode: target.Mode, Historical: (!tracked || previous == nil) && value != nil && f.Same(value, applied)}, Target: target, UseStore: useStore}, nil
}
