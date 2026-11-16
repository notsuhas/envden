package reconciliation

import (
	state "github.com/notsuhas/envden/go/cli/state/model"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
)

func ReconciliationTargets(context *syncmodel.Context, repos map[string]bool, name content.FileName, store string) ([]state.Link, error) {
	targets := []state.Link{}

	for _, link := range context.State.Links {
		if !link.LocalOnly && !context.SkippedRoots[link.Root] && link.Store == store {
			targets = append(targets, link)
		}
	}

	for _, approved := range context.State.Approved {
		id := syncmodel.Alias(context.State, approved.RepoID)

		if context.SkippedRoots[approved.Root] || !repos[id] || id != name.RepoId {
			continue
		}

		exists := false

		for _, link := range context.State.Links {
			if link.Root == approved.Root && link.Path == name.Path {
				exists = true
				break
			}
		}

		if exists {
			continue
		}

		if context.Links.SupportedPlacement == nil {
			return nil, envdenerrors.New(envdenerrors.Internal, "Checkout placement is not configured")
		}

		mode, err := context.Links.SupportedPlacement(context.Adapters, approved.Root)
		if err != nil {
			return nil, err
		}

		targets = append(targets, state.Link{Root: approved.Root, Path: name.Path, Store: store, Mode: mode})
	}

	return targets, nil
}
