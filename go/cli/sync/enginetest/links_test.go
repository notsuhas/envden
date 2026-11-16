package enginetest

import (
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/links/place"
	state "github.com/notsuhas/envden/go/cli/state/model"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
)

func syncLinks(f *fixture) sm.Links {
	return sm.Links{ApprovedCheckout: links.ApprovedCheckout, CheckoutApproval: links.CheckoutApproval,
		PruneMissingCheckouts: func(home string, s *state.State, report func(string), now func() int64) error {
			return place.PruneMissingCheckouts(f.ctx, home, s, report, f.first.Timing)
		},
		SupportedPlacement: func(a contracts.Adapters, root string) (string, error) {
			p, err := checkout.SupportedPlacement(f.ctx, a, root, false, nil, false)
			if err != nil {
				return "", err
			}
			return string(p.Mode()), nil
		},
		AliasRepo: nil,
	}
}
