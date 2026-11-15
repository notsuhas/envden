package devices

import (
	"context"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func RevocationSwap(ctx context.Context, cxt *shared.Context, h shared.History, id []byte, now int64) (manifests.Swap, error) {
	change, ring, err := shared.NextEpoch(ctx, cxt, h, h.State.Recovery, id)
	if err != nil {
		return manifests.Swap{}, err
	}

	entry, err := shared.SignEntry(cxt, h, 2, entrypayloads.RemoveDevice{Device: id, Change: change})
	if err != nil {
		return manifests.Swap{}, err
	}

	return shared.AdminSwap(h, cxt.Identity, 4, now, manifests.Swap{Entries: []encoding.Signed[codecs.Entry]{entry}, Keyring: &ring})
}
