package files

import (
	"context"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links"
	"github.com/notsuhas/envden/go/cli/links/place"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/sync/local/reconcile"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
)

func SelectedRepos(ctx context.Context, a contracts.Adapters, s *model.State, o Selection) (map[string]bool, error) {
	api := sm.Links{CheckoutApproval: links.CheckoutApproval, PruneMissingCheckouts: func(home string, s *model.State, _ func(string), _ func() int64) error {
		return place.PruneMissingCheckouts(ctx, home, s, func(string) {}, a.Timing)
	}}
	return reconcile.SelectedRepos(a, s, sm.Options{Cwd: SelectionDirectory(o), All: o.All, Now: a.Now, Fetcher: a.Fetcher}, api, nil)
}
