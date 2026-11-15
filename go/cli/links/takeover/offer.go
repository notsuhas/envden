package takeover

import (
	"context"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/contracts"
	linkmodel "github.com/notsuhas/envden/go/cli/links/model"
	"github.com/notsuhas/envden/go/cli/links/takeover/target"
	"github.com/notsuhas/envden/go/cli/state/model"
)

func OfferTakeover(ctx context.Context, a contracts.Adapters, state *model.State, links []linkmodel.OwnLink, copy bool, ask func(string) (bool, error), report func(string)) ([]linkmodel.OwnLink, error) {
	home, err := filepath.EvalSymlinks(a.UserHome)
	if err != nil {
		home = a.UserHome
	}

	left := []linkmodel.OwnLink{}
	for _, group := range GroupOwnLinks(links) {
		yes := false
		if target.RegularTarget(group.Target) && ask != nil {
			yes, err = ask(TakeoverQuestion(group, home))
			if err != nil {
				return nil, err
			}
		}

		if yes {
			left = append(left, AdoptGroup(ctx, a, state, group, copy, report)...)
		} else {
			left = append(left, group.Links...)
		}
	}

	return left, nil
}
