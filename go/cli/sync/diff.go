package sync

import (
	"context"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/lock"
	state "github.com/notsuhas/envden/go/cli/state/model"
	f "github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/cli/sync/local/reconcile"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/core/merge"
)

type DiffResult struct {
	Root    string   `json:"root"`
	Path    string   `json:"path"`
	Differs bool     `json:"differs"`
	Kind    string   `json:"kind"`
	Added   []string `json:"added,omitempty"`
	Removed []string `json:"removed,omitempty"`
	Changed []string `json:"changed,omitempty"`
	Reason  string   `json:"reason,omitempty"`
	Key     string   `json:"key,omitempty"`
}

func IncludeLink(state *state.State, link state.Link, repos map[string]bool) bool {
	if link.LocalOnly {
		return false
	}
	for _, approved := range state.Approved {
		if approved.Root == link.Root {
			return repos[sm.Alias(state, approved.RepoID)]
		}
	}

	return false
}

func Diff(ctx context.Context, a contracts.Adapters, options Options) ([]DiffResult, error) {
	result := []DiffResult{}
	err := lock.WithStateLock(ctx, a.Home, a.Timing, func(ctx context.Context) error {
		context, err := remote.SyncContext(ctx, a, options, linkAPI(ctx, a))
		if err != nil {
			return err
		}
		repos, err := reconcile.SelectedRepos(a, context.State, options, context.Links, nil)
		if err != nil {
			return err
		}
		for _, link := range context.State.Links {
			if !IncludeLink(context.State, link, repos) {
				continue
			}
			root := ""
			if link.Mode == "copy" {
				root = link.Root
			}
			before, err := f.ReadBytes(f.BasePath(a.Home, link.Store, root))
			if err != nil {
				return err
			}
			path := link.Store
			if link.Mode != "link" {
				path = filepath.Join(link.Root, link.Path)
			}
			after, err := f.ReadBytes(path)
			if err != nil {
				return err
			}
			value := merge.DiffEnvKeys(before, after)
			result = append(result, DiffResult{Root: link.Root, Path: link.Path, Differs: !f.Same(before, after), Kind: value.Kind, Added: value.Added, Removed: value.Removed, Changed: value.Changed, Reason: value.Reason, Key: value.Key})
		}

		return nil
	})

	return result, err
}
