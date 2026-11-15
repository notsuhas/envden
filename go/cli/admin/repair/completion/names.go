package completion

import (
	"context"

	"github.com/notsuhas/envden/go/cli/admin/repair"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	chainrepair "github.com/notsuhas/envden/go/core/chain/repair"
	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/files"
)

func MissingBlobNames(ctx context.Context, c *shared.Context, h shared.History, gaps chainrepair.MissingBlobs) (repair.Result, error) {
	material, err := shared.CurrentMaterial(ctx, c, h)
	if err != nil {
		return repair.Result{}, err
	}

	names := func(entries []manifests.FileEntry) ([]content.FileName, error) {
		out := []content.FileName{}
		for _, e := range entries {
			n, err := files.OpenFileName(e.Name, material.Keys[e.Epoch], material.Ring.IdKey, files.FileContext{VaultId: c.VaultID, Epoch: e.Epoch, FileId: e.FileId, Version: e.Version})
			if err != nil {
				return nil, err
			}

			out = append(out, n)
		}

		return out, nil
	}
	missing, err := names(gaps.Missing)
	if err != nil {
		return repair.Result{}, err
	}

	lost, err := names(gaps.Lost)

	return repair.Result{Kind: "missing-blobs", Missing: missing, Lost: lost}, err
}
