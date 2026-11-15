package shared

import (
	"context"
	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/core/errors"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"path/filepath"
)

func CommitAdmin(ctx context.Context, c *Context, swap m.Swap) error {
	h, err := SubmitAdmin(ctx, c, swap)
	if err != nil {
		return err
	}
	return AcceptAdmin(ctx, c, swap, h)
}

func AcceptAdmin(ctx context.Context, c *Context, swap m.Swap, h History) error {
	if c.Local.Server == nil {
		return errors.New(errors.NotFound, "Missing server configuration")
	}
	err := AcceptHistory(ctx, c, h)
	if err != nil {
		return err
	}
	if swap.Envelope != nil {
		return files.AtomicWrite(filepath.Join(c.Adapters.Home, "state", "envelope.bin"), *swap.Envelope, c.Now)
	}
	return nil
}

func SubmitAdmin(ctx context.Context, c *Context, swap m.Swap) (History, error) {
	raw, err := b.Encode(m.SwapCodec, swap)
	if err != nil {
		return History{}, err
	}
	if err = Send(ctx, c.Client, "/v1/swap", "POST", raw); err != nil {
		return History{}, err
	}
	history, err := ReadHistory(ctx, c.Client, c.VaultID)
	if err != nil {
		return history, err
	}
	if !HistoryHasHeader(history, HeaderHash(swap.Header)) {
		return history, errors.New(errors.InvalidData, "Server did not commit the requested swap")
	}
	return history, nil
}

func HistoryHasHeader(h History, hash []byte) bool {
	for _, header := range h.Headers {
		if b.Equal(HeaderHash(header), hash) {
			return true
		}
	}
	return false
}
