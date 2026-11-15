package reconcile

import (
	"os"
	"path/filepath"
	"strings"

	"github.com/notsuhas/envden/go/cli/contracts"
	state "github.com/notsuhas/envden/go/cli/state/model"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	e "github.com/notsuhas/envden/go/core/errors"
)

func SelectedRepos(a contracts.Adapters, state *state.State, options sm.Options, links sm.Links, skipped map[string]bool) (map[string]bool, error) {
	if links.PruneMissingCheckouts != nil {
		if err := links.PruneMissingCheckouts(a.Home, state, options.Report, a.Now); err != nil {
			return nil, err
		}
	}
	repos := map[string]bool{}
	cwd := options.Cwd
	if cwd == "" {
		cwd, _ = os.Getwd()
	}
	for _, approved := range state.Approved {
		rel, err := filepath.Rel(approved.Root, cwd)
		if !options.All && (err != nil || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) || filepath.IsAbs(rel)) {
			continue
		}
		checkout, err := a.Repo.CheckoutAt(approved.Root)
		if err != nil {
			return nil, err
		}
		approval := "ask"
		if checkout != nil && links.CheckoutApproval != nil {
			approval = links.CheckoutApproval(state, *checkout)
		}
		if approval == "ask" {
			if skipped != nil {
				skipped[approved.Root] = true
			}
			if options.Report != nil {
				options.Report("Skipped checkout requiring approval; run envden track")
			}
			continue
		}
		if approval == "changed" {
			return nil, e.New(e.Conflict, "Approved checkout changed; use envden alias")
		}
		repos[sm.Alias(state, approved.RepoID)] = true
	}
	if !options.All && len(repos) == 0 {
		return nil, e.New(e.Unauthorized, "Run in an approved checkout or use --all")
	}

	return repos, nil
}
