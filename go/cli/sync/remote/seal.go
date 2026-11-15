package remote

import (
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/client"
	sf "github.com/notsuhas/envden/go/cli/state/files"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	d "github.com/notsuhas/envden/go/core/protocol/codecs/content"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	pf "github.com/notsuhas/envden/go/core/protocol/files"
)

func SealUpload(context *sm.Context, repoID, path string, fileID []byte, previous *m.FileEntry, value []byte) (m.FileEntry, error) {
	epoch := context.Checkpoint.Header.Body.Epoch
	key := context.Keys[epoch]
	version := uint64(1)
	if previous != nil {
		version = previous.Version + 1
	}
	name := d.FileName{RepoId: repoID, Path: path}
	ctx := pf.FileContext{VaultId: context.VaultID, Epoch: epoch, Version: version, FileId: fileID}
	hash := make([]byte, 32)
	if value != nil {
		blob, err := pf.SealFile(d.File{RepoId: repoID, Path: path, Content: value}, key, ctx)
		if err != nil {
			return m.FileEntry{}, err
		}
		hash = cr.H("blob", blob)
		response, err := context.Client.Request(context.Context, "/v1/blobs/"+client.Text(hash), "PUT", blob)
		if err != nil {
			return m.FileEntry{}, err
		}
		response.Body.Close()
		if err = sf.AtomicWrite(filepath.Join(context.Adapters.Home, "state", "blobs", client.Text(hash)), blob, context.Options.Now); err != nil {
			return m.FileEntry{}, err
		}
	}
	sealed, err := pf.SealFileName(name, key, ctx)
	if err != nil {
		return m.FileEntry{}, err
	}
	state := 1
	if value == nil {
		state = 2
	}

	return m.FileEntry{FileId: fileID, Epoch: epoch, Version: version, State: state, BlobHash: hash, Name: sealed}, nil
}
