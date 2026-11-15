package checkout

import (
	"context"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
)

func SupportedPlacement(ctx context.Context, a contracts.Adapters, root string, copy bool, ask func(string) (bool, error), interactive bool) (adapters.Placement, error) {
	mode, err := CheckoutPlacement(ctx, a, root, copy, ask, interactive)
	if err != nil {
		return nil, err
	}
	placement := a.Placement(mode, root)
	if mode == adapters.PlacementCopy {
		return placement, nil
	}
	supported, err := placement.Supported(root)
	if err != nil {
		return nil, err
	}
	if supported {
		return placement, nil
	}
	if interactive && ask != nil {
		yes, err := ask("Links are unavailable. Use plaintext copy mode for this checkout?")
		if err != nil {
			return nil, err
		}
		if yes {
			_, err := CheckoutPlacement(ctx, a, root, true, nil, false)
			return a.Placement(adapters.PlacementCopy, root), err
		}
	}
	return nil, errors.New(errors.InvalidInput, "Links unavailable; explicitly select copy mode to continue")
}
