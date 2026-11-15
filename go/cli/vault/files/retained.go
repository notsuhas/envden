package files

import (
	"context"
	"io"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/files"
)

func optionalObject(ctx context.Context, cl *client.Client, path string) ([]byte, error) {
	response, err := cl.Request(ctx, path, "GET", nil)
	if errors.Is(err, errors.NotFound) {
		return nil, nil
	}

	if err != nil {
		return nil, err
	}

	defer func() { _ = response.Body.Close() }() // Best-effort cleanup must not replace the operation result.

	return io.ReadAll(response.Body)
}

func RetainedList(ctx context.Context, cl *client.Client, hash []byte) (*manifests.Files, error) {
	raw, err := optionalObject(ctx, cl, "/v1/files/"+client.Text(hash))
	if err != nil || raw == nil {
		return nil, err
	}

	if !encoding.Equal(crypto.H("files", raw), hash) {
		return nil, errors.New(errors.InvalidData, "File list hash mismatch")
	}

	list, err := encoding.Decode(manifests.FilesCodec, raw)

	return &list, err
}

func RetainedBlob(ctx context.Context, cl *client.Client, hash []byte) ([]byte, error) {
	return optionalObject(ctx, cl, "/v1/blobs/"+client.Text(hash))
}

func OpenedName(entry manifests.FileEntry, keys map[int][]byte, idKey, vaultID []byte) *content.FileName {
	key := keys[entry.Epoch]
	if key == nil {
		return nil
	}

	name, err := files.OpenFileName(entry.Name, key, idKey, files.FileContext{VaultId: vaultID, FileId: entry.FileId, Epoch: entry.Epoch, Version: entry.Version})
	if err != nil {
		return nil
	}

	return &name
}
