package sync

import (
	"context"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/store"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
)

func AliasUnlinkedRepo(ctx context.Context, a contracts.Adapters, source, target string) error {
	return lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		state, err := store.LoadState(a.Home)
		if err != nil {
			return err
		}

		if state != nil {
			roots := map[string]bool{}

			for _, approved := range state.Approved {
				if approved.RepoID == source {
					roots[approved.Root] = true
				}
			}

			for _, link := range state.Links {
				if roots[link.Root] {
					return envdenerrors.New(envdenerrors.Conflict, "Cannot alias a repo with placed files; run envden untrack <path> first")
				}
			}
		}

		return links.AliasRepo(ctx, a, source, target)
	})
}
