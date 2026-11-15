package completion

import (
	"context"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/client/routes"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func AvailableBlobs(ctx context.Context, c *shared.Context) (map[string]bool, error) {
	hashes, err := routes.Do(ctx, c.Client, routes.Blobs, nil)
	if err != nil {
		return nil, err
	}

	available := map[string]bool{}
	for _, hash := range hashes.Objects {
		blob, e := shared.OptionalObject(ctx, c.Client, "/v1/blobs/"+hash)
		if e != nil {
			return nil, e
		}

		if blob == nil {
			continue
		}

		raw, e := client.Binary(hash)
		if e != nil {
			return nil, e
		}

		if !encoding.Equal(crypto.H("blob", blob), raw) {
			return nil, errors.New(errors.InvalidData, "Repair blob hash mismatch")
		}

		available[encoding.Base32(raw)] = true
	}

	return available, nil
}
