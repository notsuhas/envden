package checkout

import (
	"github.com/notsuhas/envden/go/cli/links"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/adapters"
)

func RepoID(state *model.State, id string) string         { return links.RepoID(state, id) }
func CheckoutRepo(state *model.State, root string) string { return links.CheckoutRepo(state, root) }
func CheckoutApproval(state *model.State, item adapters.Checkout) string {
	return links.CheckoutApproval(state, item)
}
func ApprovedCheckout(repo adapters.Repo, state *model.State, root string) (*adapters.Checkout, error) {
	return links.ApprovedCheckout(repo, state, root)
}

func ApprovalRecord(c adapters.Checkout) model.Checkout {
	return model.Checkout{Root: c.Root, GitDir: c.GitDir, RepoID: c.RepoID, Identity: c.Identity, RootDevice: c.RootDevice, UpstreamRepoID: c.UpstreamRepoID, RegisteredWorktree: c.RegisteredWorktree, Order: []string{"identity", "rootDevice", "upstreamRepoId", "root", "repoId", "gitDir", "registeredWorktree"}}
}
