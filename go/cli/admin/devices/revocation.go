package devices

import (
	"context"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func RevocationSwap(ctx context.Context, cxt *shared.Context, h shared.History, id []byte, now int64) (m.Swap, error) {
	change, ring, err := shared.NextEpoch(ctx, cxt, h, h.State.Recovery, id)
	if err != nil {
		return m.Swap{}, err
	}
	entry, err := shared.SignEntry(cxt, h, 2, p.RemoveDevice{Device: id, Change: change})
	if err != nil {
		return m.Swap{}, err
	}
	return shared.AdminSwap(h, cxt.Identity, 4, now, m.Swap{Entries: []b.Signed[c.Entry]{entry}, Keyring: &ring})
}
