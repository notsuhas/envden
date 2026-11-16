package sync

import (
	"context"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	conflictmodel "github.com/notsuhas/envden/go/cli/model/conflicts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	statemodel "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/sync/local"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/operation"
	"github.com/notsuhas/envden/go/cli/sync/removal"
	"github.com/notsuhas/envden/go/core/adapters"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
)

type RemoveOptions struct {
	Yes, Interactive bool
	Confirm          func(string) (bool, error)
	Now              func() int64
	Report           func(string)
}

type Removed struct {
	Kind      string                 `json:"kind"`
	Path      string                 `json:"path"`
	Preserved []string               `json:"preserved"`
	Backups   []conflictmodel.Backup `json:"backups"`
	Publish   string                 `json:"publish"`
	Skipped   []string               `json:"skipped"`
}

func RemoveFile(ctx context.Context, a contracts.Adapters, path string, options RemoveOptions) (Removed, error) {
	var result Removed
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		state, err := store.LoadState(a.Home)
		if err != nil {
			return err
		}

		absolute, err := filepath.Abs(path)
		if err != nil {
			return err
		}

		var selected *statemodel.Link

		if state != nil {
			for _, link := range state.Links {
				if filepath.Join(link.Root, link.Path) == absolute && !link.LocalOnly {
					copy := link
					selected = &copy
					break
				}
			}
		}

		if selected == nil {
			return envdenerrors.New(envdenerrors.NotFound, "Env file is not tracked")
		}

		if !options.Yes {
			if !options.Interactive || options.Confirm == nil {
				return envdenerrors.New(envdenerrors.InvalidInput, "Non-interactive rm requires --yes")
			}

			yes, err := options.Confirm("Remove this env file everywhere and discard local edits and conflicts? All local content will be backed up.")
			if err != nil {
				return err
			}

			if !yes {
				return envdenerrors.New(envdenerrors.InvalidInput, "Removal cancelled")
			}
		}

		selection, err := removal.RemovalTargets(a, state, selected.Store, linkAPI(ctx, a))
		if err != nil {
			return err
		}

		result = Removed{Kind: "blocked", Path: selected.Path, Preserved: []string{}, Backups: []conflictmodel.Backup{}, Publish: "none", Skipped: selection.Skipped}

		if selection.Blocked {
			return nil
		}

		records, err := local.ConflictRecords(a.Home)
		if err != nil {
			return err
		}

		result.Backups, err = removal.PreserveRemoval(a, selected.Store, selection.Targets, records, options.Now(), options.Report)
		if err != nil {
			return err
		}

		for _, backup := range result.Backups {
			result.Preserved = append(result.Preserved, backup.Path)
		}
		if err = operation.RequestDeletion(a.Home, selected.Store, false, nil, nil, a.Now); err != nil {
			return err
		}
		if err = localfiles.WriteBytes(localfiles.BasePath(a.Home, selected.Store)+".pending", nil, a.Now); err != nil {
			return err
		}

		targets := []string{}

		for _, target := range selection.Targets {
			destination := filepath.Join(target.Root, target.Path)
			if err = a.Placement(adapters.PlacementMode(target.Mode), target.Root).Remove(&selected.Store, destination); err != nil {
				return err
			}

			targets = append(targets, destination)
		}
		if err = localfiles.WriteBytes(selected.Store, nil, a.Now); err != nil {
			return err
		}
		if err = checkout.RemoveCheckoutBases(a.Home, selection.Targets, nil, a.Now); err != nil {
			return err
		}

		var entry *string

		for _, record := range records {
			if record.Store == selected.Store && record.Entry != nil {
				entry = record.Entry
				break
			}
		}

		if entry == nil {
			entry, err = removal.RemovalEntry(a, state, selected.Root, selected.Path)
			if err != nil {
				return err
			}
		}
		if err = operation.RequestDeletion(a.Home, selected.Store, true, entry, targets, a.Now); err != nil {
			return err
		}

		published, err := operation.DeletionRequested(a.Home, selected.Store, a.Now)
		if err != nil {
			return err
		}

		if !published {
			kept := state.Links[:0]

			for _, link := range state.Links {
				if link.Store != selected.Store || link.LocalOnly {
					kept = append(kept, link)
				}
			}

			state.Links = kept
			if err = store.SaveState(ctx, a.Home, state, a.Timing); err != nil {
				return err
			}
		}

		retained := []conflictmodel.Record{}

		for _, record := range records {
			if record.Store != selected.Store {
				retained = append(retained, record)
			} else if record.Entry != nil {
				if err = local.MarkAppliedEntry(a.Home, *record.Entry, record.Store, a.Now); err != nil {
					return err
				}
			}
		}
		if err = local.SaveConflicts(a.Home, retained, a.Now); err != nil {
			return err
		}

		result.Kind = "removed"

		if published {
			result.Publish = "next-push"
		}

		return nil
	})

	return result, err
}
