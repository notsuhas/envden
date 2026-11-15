package versions

import (
	"context"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
)

type Source struct {
	Context *shared.Context
	History shared.History
	Keys    map[int][]byte
	IDKey   []byte
}

func HistorySource(ctx context.Context, a contracts.Adapters, now func() int64, fetch client.Fetch) (Source, error) {
	c, err := shared.AdminContext(ctx, a, now, fetch)
	if err != nil {
		return Source{}, err
	}

	h, err := shared.CurrentHistory(ctx, c)
	if err != nil {
		return Source{}, err
	}

	material, err := shared.CurrentMaterial(ctx, c, h)
	if err != nil {
		return Source{}, err
	}

	return Source{c, h, material.Keys, material.Ring.IdKey}, nil
}
