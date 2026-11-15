package links

import (
	"context"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/model"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote"
)

func VaultRepos(ctx context.Context, a contracts.Adapters, state *model.State, now func() int64) (map[string]bool, error) {
	result := map[string]bool{}
	if state.Checkpoint == "" {
		return result, nil
	}

	context, err := remote.SyncContext(ctx, a, syncmodel.Options{Now: now, Fetcher: a.Fetcher, All: true}, syncmodel.Links{})
	if err != nil {
		return nil, err
	}

	entries, err := remote.ReadableEntries(context)
	if err != nil {
		return nil, err
	}

	for _, entry := range entries {
		if entry.State != 1 && entry.State != 3 {
			continue
		}

		name, err := remote.EntryName(context, entry)
		if err != nil {
			return nil, err
		}

		result[name.RepoId] = true
	}

	return result, nil
}
