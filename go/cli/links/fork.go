package links

import (
	"slices"

	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/adapters"
)

func ShouldAskAlias(state *model.State, item adapters.Checkout, repos map[string]bool) bool {
	if item.UpstreamRepoID == nil || !repos[*item.UpstreamRepoID] || slices.Contains(state.AliasAsked, item.RepoID) {
		return false
	}

	for _, f := range state.Aliases {
		if f.Key == item.RepoID && f.Value != "" {
			return false
		}
	}

	for _, a := range state.Approved {
		if a.RepoID == item.RepoID {
			for _, l := range state.Links {
				if l.Root == a.Root {
					return false
				}
			}
		}
	}

	return DeriveAlias(state.Aliases, item.RepoID, *item.UpstreamRepoID) == "assign"
}

func OfferForkAlias(state *model.State, item adapters.Checkout, repos map[string]bool, confirm func(string, string) (bool, error)) error {
	if !ShouldAskAlias(state, item, repos) {
		return nil
	}

	state.AliasAsked = append(state.AliasAsked, item.RepoID)
	state.Touch("aliasAsked")
	yes, err := confirm(item.RepoID, *item.UpstreamRepoID)
	if err != nil {
		return err
	}

	if yes {
		state.Aliases.Set(item.RepoID, *item.UpstreamRepoID)
	}

	return nil
}
