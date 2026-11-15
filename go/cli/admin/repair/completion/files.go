package completion

import (
	"context"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func RepairFiles(ctx context.Context, c *shared.Context, h shared.History) (manifests.Files, error) {
	head := h.Headers[len(h.Headers)-1].Body
	raw, err := shared.OptionalObject(ctx, c.Client, "/v1/files/"+client.Text(head.FilesHash))
	if err != nil {
		return manifests.Files{}, err
	}

	if !encoding.Equal(crypto.H("files", raw), head.FilesHash) {
		return manifests.Files{}, errors.New(errors.InvalidData, "Repair file list hash mismatch")
	}

	return encoding.Decode(manifests.FilesCodec, raw)
}
