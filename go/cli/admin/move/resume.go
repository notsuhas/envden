package move

import (
	"context"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func resumeMoveAddress(ctx context.Context, cxt *shared.Context, directory string) (string, error) {
	h, err := shared.CurrentHistory(ctx, cxt)
	if err != nil {
		return "", err
	}

	moved := lastMove(h)
	head := h.Headers[len(h.Headers)-1]
	if moved == nil || head.Body.Op != 10 {
		return "", nil
	}

	if err = files.AtomicWrite(filepath.Join(directory, "move-pin"), []byte(client.Text(moved.NewPin)), cxt.Now); err != nil {
		return "", err
	}

	var entry encoding.Signed[codecs.Entry]
	for i := len(h.Entries) - 1; i >= 0; i-- {
		if h.Entries[i].Body.Kind == 5 {
			entry = h.Entries[i]
			break
		}
	}

	swap := manifests.Swap{ExpectedHead: head.Body.Prev, Header: head, Entries: []encoding.Signed[codecs.Entry]{entry}}
	raw, err := encoding.Encode(manifests.SwapCodec, swap)
	if err != nil {
		return "", err
	}

	err = files.AtomicWrite(filepath.Join(directory, "move-swap.bin"), raw, cxt.Now)

	return moved.NewAddress, err
}
