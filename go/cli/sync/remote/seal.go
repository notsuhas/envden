package remote

import (
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/client"
	statefiles "github.com/notsuhas/envden/go/cli/state/files"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	protocolfiles "github.com/notsuhas/envden/go/core/protocol/files"
)

func SealUpload(context *syncmodel.Context, repoID, path string, fileID []byte, previous *manifests.FileEntry, value []byte) (manifests.FileEntry, error) {
	epoch := context.Checkpoint.Header.Body.Epoch
	key := context.Keys[epoch]
	version := uint64(1)

	if previous != nil {
		version = previous.Version + 1
	}

	name := content.FileName{RepoId: repoID, Path: path}
	ctx := protocolfiles.FileContext{VaultId: context.VaultID, Epoch: epoch, Version: version, FileId: fileID}
	hash := make([]byte, 32)

	if value != nil {
		blob, err := protocolfiles.SealFile(content.File{RepoId: repoID, Path: path, Content: value}, key, ctx)
		if err != nil {
			return manifests.FileEntry{}, err
		}

		hash = crypto.H("blob", blob)
		response, err := context.Client.Request(context.Context, "/v1/blobs/"+client.Text(hash), "PUT", blob)
		if err != nil {
			return manifests.FileEntry{}, err
		}

		_ = response.Body.Close() // Best-effort cleanup preserves the original operation result.
		if err = statefiles.AtomicWrite(filepath.Join(context.Adapters.Home, "state", "blobs", client.Text(hash)), blob, context.Options.Now); err != nil {
			return manifests.FileEntry{}, err
		}
	}

	sealed, err := protocolfiles.SealFileName(name, key, ctx)
	if err != nil {
		return manifests.FileEntry{}, err
	}

	state := 1

	if value == nil {
		state = 2
	}

	return manifests.FileEntry{FileId: fileID, Epoch: epoch, Version: version, State: state, BlobHash: hash, Name: sealed}, nil
}
