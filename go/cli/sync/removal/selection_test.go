package removal

import (
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/model"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/adapters"
)

func TestRemovalApproval(t *testing.T) {
	for _, mode := range []string{"link", "copy"} {
		state := model.EmptyState("fixture")
		state.Links = []model.Link{{Root: "/approved", Path: ".env", Store: "store", Mode: mode}, {Root: "/needs-approval", Path: ".env", Store: "store", Mode: mode}, {Root: "/local", Path: ".env", Store: "store", Mode: mode, LocalOnly: true}}
		links := syncmodel.Links{ApprovedCheckout: func(_ adapters.Repo, _ *model.State, root string) (*adapters.Checkout, error) {
			if root != "/approved" {
				return nil, nil
			}

			return &adapters.Checkout{Root: root}, nil
		}}
		result, err := RemovalTargets(contracts.Adapters{}, state, "store", links)
		if err != nil || len(result.Targets) != 1 || len(result.Skipped) != 1 || result.Blocked != (mode == "link") {
			t.Fatal(result, err)
		}
	}
}
