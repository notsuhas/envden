package recovery

import (
	"context"
	"os"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func SavePendingKit(c *shared.Context, swap manifests.Swap) error {
	raw, err := encoding.Encode(manifests.SwapCodec, swap)
	if err != nil {
		return err
	}

	return files.AtomicWrite(filepath.Join(c.Adapters.Home, "state", "kit-replace"), []byte(client.Text(raw)), c.Now)
}

func ClearPendingKit(c *shared.Context) error {
	err := os.Remove(filepath.Join(c.Adapters.Home, "state", "kit-replace"))
	if os.IsNotExist(err) {
		return nil
	}

	return err
}

func SettlePendingKit(ctx context.Context, c *shared.Context) (bool, error) {
	saved, err := files.OptionalRead(filepath.Join(c.Adapters.Home, "state", "kit-replace"))
	if err != nil || saved == nil {
		return false, err
	}

	raw, err := client.Binary(*saved)
	if err != nil {
		return false, err
	}

	swap, err := encoding.Decode(manifests.SwapCodec, raw)
	if err != nil {
		return false, err
	}

	h, err := shared.CurrentHistory(ctx, c)
	if err != nil {
		return false, err
	}

	committed := shared.HistoryHasHeader(h, shared.HeaderHash(swap.Header))
	if committed {
		if err = shared.AcceptAdmin(ctx, c, swap, h); err != nil {
			return false, err
		}
	}

	return committed, ClearPendingKit(c)
}
