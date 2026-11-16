package sync

import (
	"context"
	"path/filepath"
	"slices"

	"github.com/notsuhas/envden/go/cli/contracts"
	conflictmodel "github.com/notsuhas/envden/go/cli/model/conflicts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/cli/sync/local"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/history"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/operation"
	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/placement/target"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
)

type ResolveOptions struct {
	File, Repo, Choice string
	Now                func() int64
}

func ResolveConflict(ctx context.Context, a contracts.Adapters, options ResolveOptions) (conflictmodel.Resolved, error) {
	var result conflictmodel.Resolved
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		records, err := local.ConflictRecords(a.Home)
		if err != nil {
			return err
		}

		matches := SelectConflicts(records, options)

		if len(matches) != 1 {
			return envdenerrors.New(envdenerrors.InvalidInput, "Name exactly one conflict file")
		}

		now := options.Now()
		clock := func() int64 { return now }
		record := matches[0]
		var server []byte

		if !record.Deleted {
			server, err = localfiles.ReadBytes(record.Server)
			if err != nil {
				return err
			}
		}

		value, err := ResolutionBytes(options.Choice, record, server)
		if err != nil {
			return err
		}

		result = conflictmodel.Resolved{Kind: "resolved", Path: record.Path, Preserved: []string{}, PlacementReports: []string{}, Backups: filepath.Join(a.Home, "conflicts", "backups"), SavedBackups: []conflictmodel.Backup{}}
		sources := append([]string{record.Mine, record.Server, record.Remote}, record.Alternatives...)
		sources = append(sources, record.Store)

		for _, path := range sources {
			saved, err := local.Backup(a.Home, path, now)
			if err != nil {
				return err
			}

			if saved != "" {
				result.Preserved = append(result.Preserved, saved)
				result.SavedBackups = append(result.SavedBackups, conflictmodel.Backup{Source: path, Path: saved})
			}
		}

		targets := []string{}

		for _, target := range record.Targets {
			targets = append(targets, filepath.Join(target.Root, target.Path))
		}
		if err = operation.RequestDeletion(a.Home, record.Store, value == nil && (record.Deleted || record.MineDeleted), record.Entry, targets, clock); err != nil {
			return err
		}

		base := localfiles.BasePath(a.Home, record.Store)

		for _, suffix := range []string{".pending", ".corrupt"} {
			if err = localfiles.WriteBytes(base+suffix, nil, clock); err != nil {
				return err
			}
		}
		if err = localfiles.WriteBytes(record.Store, value, clock); err != nil {
			return err
		}

		state, err := store.LoadState(a.Home)
		if err != nil {
			return err
		}

		if state == nil {
			return envdenerrors.New(envdenerrors.NotFound, "Local sync state is unavailable")
		}

		remote, err := localfiles.ReadBytes(record.Remote)
		if err != nil {
			return err
		}

		preserve := remote != nil

		if record.Entry != nil {
			entry, err := operation.DecodeEntry(*record.Entry)
			if err != nil {
				return err
			}

			preserve = entry.State == 1
		}

		context := &syncmodel.Context{Context: ctx, Adapters: a, State: state, Options: Options{Now: clock, Report: func(message string) { result.PlacementReports = append(result.PlacementReports, message) }}, Links: linkAPI(ctx, a)}

		for _, item := range record.Targets {
			placed, err := target.PlaceFileTarget(context, item, value, preserve, nil)
			if err != nil {
				return err
			}

			if placed {
				root := ""

				if item.Mode == "copy" {
					root = item.Root
				}
				if err = history.SaveBase(localfiles.BasePath(a.Home, record.Store, root), value, a.Now); err != nil {
					return err
				}
			}
		}
		if err = store.SaveState(ctx, a.Home, state, a.Timing); err != nil {
			return err
		}

		if record.Entry != nil {
			if err = history.SaveBase(record.Base, value, a.Now); err != nil {
				return err
			}
			if err = local.MarkAppliedEntry(a.Home, *record.Entry, record.Store, a.Now); err != nil {
				return err
			}
		}

		records = slices.DeleteFunc(records, func(item conflictmodel.Record) bool { return item.Base == record.Base })
		if err = local.SaveConflicts(a.Home, records, clock); err != nil {
			return err
		}

		sources = append([]string{record.File, record.Server, record.Remote, record.Mine}, record.Alternatives...)

		for _, path := range sources {
			if err = localfiles.WriteBytes(path, nil, clock); err != nil {
				return err
			}
		}

		return nil
	})

	return result, err
}
