package completion

import (
	"context"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/errors"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func RepairFiles(ctx context.Context, c *shared.Context, h shared.History) (m.Files, error) {
	head := h.Headers[len(h.Headers)-1].Body
	raw, err := shared.OptionalObject(ctx, c.Client, "/v1/files/"+client.Text(head.FilesHash))
	if err != nil {
		return m.Files{}, err
	}
	if !b.Equal(crypto.H("files", raw), head.FilesHash) {
		return m.Files{}, errors.New(errors.InvalidData, "Repair file list hash mismatch")
	}
	return b.Decode(m.FilesCodec, raw)
}
