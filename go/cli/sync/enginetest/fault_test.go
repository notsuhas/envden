package enginetest

import (
	"errors"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/core/adapters"
	fakeplace "github.com/notsuhas/envden/go/testing/placement"
)

func failPlacement(f *fixture, a *contracts.Adapters, root string, once bool) func() {
	original := a.Placement
	failed := false
	a.Placement = func(mode adapters.PlacementMode, at string) adapters.Placement {
		p := original(mode, at)

		return fakeplace.CreateFakePlacementAdapter(fakeplace.Operations{Mode: mode, Supported: p.Supported, Inspect: p.Inspect, Remove: p.Remove, Place: func(store, destination string, prepare func(string) error, replacing *string) error {
			if (root == "" || root == at) && (!once || !failed) {
				failed = true

				return errors.New("injected placement failure")
			}

			return p.Place(store, destination, prepare, replacing)
		}})
	}

	return func() { a.Placement = original }
}
