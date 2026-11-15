package files

import (
	"context"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	f "github.com/notsuhas/envden/go/core/protocol/files"
	"io"
)

func optionalObject(ctx context.Context, cl *client.Client, path string) ([]byte, error) {
	response, err := cl.Request(ctx, path, "GET", nil)
	if errors.Is(err, errors.NotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	defer response.Body.Close()
	return io.ReadAll(response.Body)
}

func RetainedList(ctx context.Context, cl *client.Client, hash []byte) (*m.Files, error) {
	raw, err := optionalObject(ctx, cl, "/v1/files/"+client.Text(hash))
	if err != nil || raw == nil {
		return nil, err
	}
	if !b.Equal(c.H("files", raw), hash) {
		return nil, errors.New(errors.InvalidData, "File list hash mismatch")
	}
	list, err := b.Decode(m.FilesCodec, raw)
	return &list, err
}

func RetainedBlob(ctx context.Context, cl *client.Client, hash []byte) ([]byte, error) {
	return optionalObject(ctx, cl, "/v1/blobs/"+client.Text(hash))
}

func OpenedName(entry m.FileEntry, keys map[int][]byte, idKey, vaultID []byte) *content.FileName {
	key := keys[entry.Epoch]
	if key == nil {
		return nil
	}
	name, err := f.OpenFileName(entry.Name, key, idKey, f.FileContext{VaultId: vaultID, FileId: entry.FileId, Epoch: entry.Epoch, Version: entry.Version})
	if err != nil {
		return nil
	}
	return &name
}
