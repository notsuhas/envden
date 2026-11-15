package completion

import (
	"context"
	"github.com/notsuhas/envden/go/cli/admin/repair"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	r "github.com/notsuhas/envden/go/core/chain/repair"
	d "github.com/notsuhas/envden/go/core/protocol/codecs/content"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	f "github.com/notsuhas/envden/go/core/protocol/files"
)

func MissingBlobNames(ctx context.Context, c *shared.Context, h shared.History, gaps r.MissingBlobs) (repair.Result, error) {
	material, err := shared.CurrentMaterial(ctx, c, h)
	if err != nil {
		return repair.Result{}, err
	}
	names := func(entries []m.FileEntry) ([]d.FileName, error) {
		out := []d.FileName{}
		for _, e := range entries {
			n, err := f.OpenFileName(e.Name, material.Keys[e.Epoch], material.Ring.IdKey, f.FileContext{VaultId: c.VaultID, Epoch: e.Epoch, FileId: e.FileId, Version: e.Version})
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
