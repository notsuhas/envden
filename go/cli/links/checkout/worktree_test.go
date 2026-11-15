package checkout

import (
	"testing"

	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/adapters"
)

func TestWorktreeApproval(t *testing.T) {
	identity := "a"
	other := "b"
	yes := true
	clone := adapters.Checkout{Root: "/code/main", GitDir: "/code/main/.git", RepoID: "host/repo", Identity: &identity}
	worktree := clone
	worktree.Root = "/code/branch"
	worktree.Identity = &other
	worktree.RegisteredWorktree = &yes
	approved := model.EmptyState("test")
	approved.Approved = append(approved.Approved, ApprovalRecord(clone))
	changed := clone
	changed.Identity = &other
	recreated := model.EmptyState("test")
	recreated.Approved = append(recreated.Approved, approved.Approved...)
	recreated.Approved = append(recreated.Approved, ApprovalRecord(worktree))
	separate := worktree
	separate.GitDir = "/code/other/.git"
	unregistered := worktree
	unregistered.RegisteredWorktree = nil
	foreign := worktree
	foreign.RepoID = "host/fork"
	for _, row := range []struct {
		name    string
		state   *model.State
		item    adapters.Checkout
		clone   *adapters.Checkout
		enabled bool
		want    string
	}{
		{"default", approved, worktree, &clone, true, "approved"}, {"off", approved, worktree, &clone, false, "ask"}, {"unapproved", model.EmptyState("x"), worktree, &clone, true, "ask"}, {"recreated clone", approved, worktree, &changed, true, "ask"}, {"no clone", approved, worktree, nil, true, "ask"}, {"separate", approved, separate, &clone, true, "ask"}, {"unregistered", approved, unregistered, &clone, true, "ask"}, {"main", model.EmptyState("x"), clone, &clone, true, "ask"}, {"foreign", approved, foreign, &clone, true, "ask"}, {"recreated path", recreated, worktree, &clone, true, "ask"},
	} {
		t.Run(row.name, func(t *testing.T) {
			if got := WorktreeApproval(row.state, row.item, row.clone, row.enabled); got != row.want {
				t.Fatalf("got %q want %q", got, row.want)
			}
		})
	}
}
