package sync

import (
	"context"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/links/place"
	state "github.com/notsuhas/envden/go/cli/state/model"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/adapters"
)

func linkAPI(ctx context.Context, a contracts.Adapters) syncmodel.Links {
	return syncmodel.Links{
		ApprovedCheckout: func(repo adapters.Repo, state *state.State, root string) (*adapters.Checkout, error) {
			return links.ApprovedCheckout(repo, state, root)
		},
		CheckoutApproval: links.CheckoutApproval,
		PruneMissingCheckouts: func(home string, state *state.State, report func(string), now func() int64) error {
			if report == nil {
				report = func(string) {}
			}

			return place.PruneMissingCheckouts(ctx, home, state, report, a.Timing)
		},
		SupportedPlacement: func(a contracts.Adapters, root string) (string, error) {
			p, err := checkout.SupportedPlacement(ctx, a, root, false, nil, false)
			if err != nil {
				return "", err
			}

			return string(p.Mode()), nil
		},
		AliasRepo: links.AliasRepo,
	}
}
