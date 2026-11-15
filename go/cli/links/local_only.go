package links

import (
	"context"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
)

func MarkLocalOnly(ctx context.Context, a contracts.Adapters, state *model.State, root, path string) error {
	return lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		for i := range state.Links {
			link := &state.Links[i]
			if link.Root != root || link.Path != path {
				continue
			}

			placement := a.Placement(adapters.PlacementCopy, root)
			destination := filepath.Join(root, path)
			status, err := placement.Inspect(link.Store, destination)
			if err != nil {
				return err
			}

			switch status {
			case adapters.PlacementLinked, adapters.PlacementRelinkable:
				if err := placement.Place(link.Store, destination, nil, nil); err != nil {
					return err
				}
			case adapters.PlacementMissing:
				return errors.New(errors.NotFound, "File is missing")
			}

			link.Mode = "copy"
			link.LocalOnly = true

			return store.SaveState(ctx, a.Home, state, a.Timing)
		}

		return errors.New(errors.NotFound, "File is not managed by envden")
	})
}
