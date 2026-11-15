package local

import (
	state "github.com/notsuhas/envden/go/cli/state/model"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
)

func ReceivesFile(state *state.State, repoID, path string) bool {
	for _, checkout := range state.Approved {
		if sm.Alias(state, checkout.RepoID) != repoID {
			continue
		}
		blocked := false
		for _, link := range state.Links {
			if link.Root == checkout.Root && link.Path == path && link.LocalOnly {
				blocked = true
				break
			}
		}
		if !blocked {
			return true
		}
	}

	return false
}
