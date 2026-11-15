package repair

import (
	"context"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	historyfiles "github.com/notsuhas/envden/go/cli/history/files"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func uploadCachedBlobs(ctx context.Context, c *Context, files manifests.Files) ([][]byte, error) {
	blobs := [][]byte{}
	for _, f := range files.Entries {
		if f.State != 1 && f.State != 3 {
			continue
		}

		raw, err := historyfiles.ReadBytes(filepath.Join(c.Adapters.Home, "state", "blobs", client.Text(f.BlobHash)))
		if err != nil {
			return nil, err
		}

		if raw == nil {
			continue
		}

		if !encoding.Equal(crypto.H("blob", raw), f.BlobHash) {
			return nil, errors.New(errors.InvalidData, "Cached blob hash mismatch")
		}

		if err = shared.Send(ctx, c.Client, "/v1/blobs/"+client.Text(f.BlobHash), "PUT", raw); err != nil {
			return nil, err
		}

		blobs = append(blobs, f.BlobHash)
	}

	return blobs, nil
}
