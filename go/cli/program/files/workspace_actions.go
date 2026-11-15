package files

import (
	"context"
	"github.com/notsuhas/envden/go/cli/links"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/lib/commander"
	"path/filepath"
)

func untrackAction(i *commander.Invocation) error {
	env, err := runtime.Get(i)
	if err != nil {
		return err
	}
	cancelled, err := checkout.Untrack(env.Context, env.Adapters, i.Args[0])
	if err != nil {
		return err
	}
	for _, file := range cancelled {
		if err := runtime.Print(i, "Cancelled removal: "+file); err != nil {
			return err
		}
	}
	return nil
}

func localOnlyAction(i *commander.Invocation) error {
	env, err := runtime.Get(i)
	if err != nil {
		return err
	}
	absolute, err := filepath.Abs(i.Args[0])
	if err != nil {
		return err
	}
	return lock.WithStateLock(env.Context, env.Adapters.Home, env.Adapters.Timing, func(ctx context.Context) error {
		state, err := store.LoadState(env.Adapters.Home)
		if err != nil {
			return err
		}
		if state != nil && state.CreationPending != "" {
			return errors.New(errors.Conflict, "Setup didn't finish. Run envden setup again to finish it")
		}
		if state == nil || state.Server == nil || state.VaultID == "" {
			return errors.New(errors.NotFound, "Not set up yet. Run envden setup or envden join")
		}
		for _, link := range state.Links {
			if filepath.Join(link.Root, link.Path) == absolute {
				return links.MarkLocalOnly(ctx, env.Adapters, state, link.Root, link.Path)
			}
		}
		return errors.New(errors.NotFound, "File is not managed by envden")
	})
}
