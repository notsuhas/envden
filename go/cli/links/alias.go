package links

import (
	"context"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/store"
	"github.com/notsuhas/envden/go/core/errors"
)

func DeriveAlias(aliases jsonvalue.Object, source, target string) string {
	if source == "" || target == "" || source == target {
		return "invalid"
	}
	for _, f := range aliases {
		if f.Key == target && f.Value != "" || f.Value == source {
			return "chain"
		}
	}
	return "assign"
}

func AliasRepo(ctx context.Context, a contracts.Adapters, source, target string) error {
	return lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		state, err := store.LoadState(a.Home)
		if err != nil {
			return err
		}
		if state == nil {
			return errors.New(errors.NotFound, "Not set up yet. Run envden setup or envden join")
		}
		switch DeriveAlias(state.Aliases, source, target) {
		case "invalid":
			return errors.New(errors.InvalidInput, "Provide different repo IDs")
		case "chain":
			return errors.New(errors.Conflict, "Alias chains are not allowed")
		}
		state.Aliases.Set(source, target)
		return store.SaveState(ctx, a.Home, state, a.Timing)
	})
}
