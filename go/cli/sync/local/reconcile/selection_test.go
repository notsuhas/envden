package reconcile

import (
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/model"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/adapters"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	fake "github.com/notsuhas/envden/go/testing/repo"
)

func TestRepoSelection(t *testing.T) {
	state := model.EmptyState("fixture")
	state.Approved = []model.Checkout{{Root: "/repo", RepoID: "repo"}, {Root: "/other", RepoID: "other"}}
	state.Aliases.Set("repo", "alias")
	a := contracts.Adapters{Repo: fake.CreateFakeRepoAdapter(fake.Operations{CheckoutAt: func(root string) (*adapters.Checkout, error) { return &adapters.Checkout{Root: root}, nil }})}

	for _, tc := range []struct {
		cwd, approval string
		all           bool
		want          int
		code          envdenerrors.Code
	}{
		{"/repo/sub", "approved", false, 1, ""}, {"/repo-other", "approved", false, 0, envdenerrors.Unauthorized}, {"/outside", "approved", true, 2, ""}, {"/repo", "ask", false, 0, envdenerrors.Unauthorized}, {"/repo", "changed", false, 0, envdenerrors.Conflict},
	} {
		skipped := map[string]bool{}
		links := syncmodel.Links{CheckoutApproval: func(*model.State, adapters.Checkout) string { return tc.approval }}
		result, err := SelectedRepos(a, state, syncmodel.Options{Cwd: tc.cwd, All: tc.all}, links, skipped)

		if tc.code != "" {
			if !envdenerrors.Is(err, tc.code) {
				t.Fatal(tc, err)
			}

			continue
		}
		if err != nil || len(result) != tc.want {
			t.Fatal(tc, result, err)
		}

		if result["repo"] {
			t.Fatal("alias ignored")
		}
	}
}
