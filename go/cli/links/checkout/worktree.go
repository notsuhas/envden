package checkout

import (
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/adapters"
)

func registered(c adapters.Checkout) bool {
	return c.RegisteredWorktree != nil && *c.RegisteredWorktree
}

func WorktreeApproval(state *model.State, item adapters.Checkout, clone *adapters.Checkout, enabled bool) string {
	if !enabled || !registered(item) || clone == nil || registered(*clone) || clone.Root == item.Root || clone.GitDir != item.GitDir || RepoID(state, clone.RepoID) != RepoID(state, item.RepoID) {
		return "ask"
	}

	for _, a := range state.Approved {
		if a.Root == item.Root {
			return "ask"
		}
	}

	if CheckoutApproval(state, *clone) == "approved" {
		return "approved"
	}

	return "ask"
}

func AutoApprovedWorktree(a contracts.Adapters, state *model.State, item adapters.Checkout) (bool, error) {
	if !registered(item) || CheckoutApproval(state, item) != "ask" {
		return false, nil
	}

	config, err := settings.ReadConfig(a.Home)
	if err != nil {
		return false, err
	}

	for _, old := range state.Approved {
		if old.GitDir != item.GitDir || old.Root == item.Root {
			continue
		}

		clone, err := a.Repo.CheckoutAt(old.Root)
		if err == nil && clone != nil && !registered(*clone) {
			return WorktreeApproval(state, item, clone, config.AutoApproveWorktrees) == "approved", nil
		}
	}

	return false, nil
}

func AdoptWorktreeAt(a contracts.Adapters, state *model.State, path string, report func(string)) error {
	item, err := a.Repo.CheckoutAt(path)
	if err != nil || item == nil {
		return nil //nolint:nilerr // An unreadable checkout is not eligible for automatic adoption.
	}

	approved, err := AutoApprovedWorktree(a, state, *item)
	if err != nil {
		return err
	}

	if approved {
		state.Approved = append(state.Approved, ApprovalRecord(*item))
		if report != nil {
			report(WorktreeApprovedNotice(*item))
		}
	}

	return nil
}

func WorktreeApprovedNotice(item adapters.Checkout) string {
	return output.SanitizeTerminal("Approved worktree " + item.Root + " (auto-approve-worktrees)")
}
