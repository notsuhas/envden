package links

import (
	"strings"

	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/adapters"
)

func RepoID(state *model.State, id string) string {
	for _, f := range state.Aliases {
		if f.Key == id {
			if value, ok := f.Value.(string); ok {
				return value
			}
		}
	}

	return id
}

func CheckoutRepo(state *model.State, root string) string {
	for _, item := range state.Approved {
		if item.Root == root {
			return RepoID(state, item.RepoID)
		}
	}

	return ""
}

func CheckoutApproval(state *model.State, checkout adapters.Checkout) string {
	for _, item := range state.Approved {
		if item.Root == checkout.Root {
			if RepoID(state, item.RepoID) != RepoID(state, checkout.RepoID) {
				return "changed"
			}

			break
		}
	}

	for _, item := range state.Approved {
		if item.Root == checkout.Root && item.GitDir == checkout.GitDir && equalIdentity(item.Identity, checkout.Identity) && RepoID(state, item.RepoID) == RepoID(state, checkout.RepoID) {
			return "approved"
		}
	}

	return "ask"
}

func equalIdentity(a, b *string) bool {
	return a == nil && b == nil || a != nil && b != nil && *a == *b
}

func ApprovedCheckout(repo adapters.Repo, state *model.State, root string) (*adapters.Checkout, error) {
	item, err := repo.CheckoutAt(root)
	if err != nil {
		return nil, err
	}

	if item != nil && CheckoutApproval(state, *item) == "approved" {
		return item, nil
	}

	return nil, nil
}

func CheckoutLabel(state *model.State, item adapters.Checkout, files []string, home string) string {
	path := item.Root
	if path == home {
		path = "~"
	} else if strings.HasPrefix(path, home+"/") {
		path = "~" + strings.TrimPrefix(path, home)
	}

	found := strings.Join(files, ", ")
	if len(files) == 0 {
		found = "files from the vault"
	}

	if item.RegisteredWorktree != nil && *item.RegisteredWorktree {
		for _, a := range state.Approved {
			if a.GitDir == item.GitDir && a.RepoID == item.RepoID {
				return path + ", worktree of " + item.RepoID + " (" + found + ")"
			}
		}
	}

	return path + " (" + found + ")"
}
