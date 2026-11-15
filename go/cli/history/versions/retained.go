package versions

import (
	"bytes"
	"context"
	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/errors"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	f "github.com/notsuhas/envden/go/core/protocol/files"
	"os"
	"path/filepath"
)

type RetainedVersion struct {
	Version uint64
	State   int
	Header  *b.Signed[m.ManifestHeader]
	Content []byte
}
type RetainedWalk struct {
	Versions []RetainedVersion
	Pruned   bool
}

func RetainedList(ctx context.Context, c *client.Client, hash []byte) (*m.Files, error) {
	raw, err := shared.OptionalObject(ctx, c, "/v1/files/"+client.Text(hash))
	if err != nil || raw == nil {
		return nil, err
	}
	if !b.Equal(crypto.H("files", raw), hash) {
		return nil, errors.New(errors.InvalidData, "File list hash mismatch")
	}
	value, err := b.Decode(m.FilesCodec, raw)
	return &value, err
}

func RetainedVersions(ctx context.Context, s Source, ids [][]byte) (map[string]RetainedWalk, error) {
	walks, err := WalkVersions(s.History.Headers, ids, func(hash []byte) (*m.Files, error) { return RetainedList(ctx, s.Context.Client, hash) })
	if err != nil {
		return nil, err
	}
	result := map[string]RetainedWalk{}
	for _, fileID := range ids {
		id := b.Base32(fileID)
		walk := walks[id]
		out := RetainedWalk{Versions: []RetainedVersion{}, Pruned: walk.Pruned}
		for _, v := range walk.Versions {
			entry := v.Entry
			key := s.Keys[entry.Epoch]
			if key == nil {
				continue
			}
			c := f.FileContext{VaultId: s.Context.VaultID, Epoch: entry.Epoch, FileId: entry.FileId, Version: entry.Version}
			name, e := f.OpenFileName(entry.Name, key, s.IDKey, c)
			if e != nil {
				continue
			}
			var content []byte
			if entry.State != 2 && entry.State != 4 {
				box, e := os.ReadFile(filepath.Join(s.Context.Adapters.Home, "state", "blobs", client.Text(entry.BlobHash)))
				if os.IsNotExist(e) {
					box, e = shared.OptionalObject(ctx, s.Context.Client, "/v1/blobs/"+client.Text(entry.BlobHash))
				}
				if e != nil {
					return nil, e
				}
				if box == nil {
					out.Pruned = true
					break
				}
				opened, e := f.OpenFile(box, key, s.IDKey, c, entry.BlobHash, name)
				if e != nil {
					return nil, e
				}
				content = opened.Content
			}
			out.Versions = append(out.Versions, RetainedVersion{entry.Version, entry.State, v.Header, content})
		}
		result[id] = out
	}
	return result, nil
}

func MatchingVersion(versions []RetainedVersion, content []byte) *uint64 {
	for _, v := range versions {
		if (v.Content == nil) == (content == nil) && bytes.Equal(v.Content, content) {
			version := v.Version
			return &version
		}
	}
	return nil
}
