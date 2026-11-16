package remote

import (
	"io"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/client"
	statefiles "github.com/notsuhas/envden/go/cli/state/files"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	protocolfiles "github.com/notsuhas/envden/go/core/protocol/files"
)

func fileContext(context *syncmodel.Context, entry manifests.FileEntry) protocolfiles.FileContext {
	return protocolfiles.FileContext{VaultId: context.VaultID, Epoch: entry.Epoch, Version: entry.Version, FileId: entry.FileId}
}

func EntryName(context *syncmodel.Context, entry manifests.FileEntry) (content.FileName, error) {
	key := context.Keys[entry.Epoch]

	if key == nil {
		return content.FileName{}, envdenerrors.New(envdenerrors.Locked, "Epoch key unavailable")
	}

	return protocolfiles.OpenFileName(entry.Name, key, context.Checkpoint.IdKey, fileContext(context, entry))
}

func ReadableEntries(context *syncmodel.Context) ([]manifests.FileEntry, error) {
	entries := []manifests.FileEntry{}

	for _, entry := range context.Checkpoint.Files.Entries {
		_, err := EntryName(context, entry)

		if envdenerrors.Is(err, envdenerrors.Locked) {
			return nil, err
		}
		if err == nil {
			entries = append(entries, entry)
		}
	}

	return entries, nil
}

func EntryContent(context *syncmodel.Context, entry manifests.FileEntry) ([]byte, error) {
	if entry.State == 2 || entry.State == 4 {
		return nil, nil
	}

	name, err := EntryName(context, entry)
	if err != nil {
		return nil, err
	}

	path := filepath.Join(context.Adapters.Home, "state", "blobs", client.Text(entry.BlobHash))
	cached, err := localfiles.ReadBytes(path)
	if err != nil {
		return nil, err
	}

	box := cached

	if box == nil {
		response, err := context.Client.Request(context.Context, "/v1/blobs/"+client.Text(entry.BlobHash), "GET", nil)
		if err != nil {
			return nil, err
		}

		defer func() { _ = response.Body.Close() }() // Best-effort cleanup preserves the original operation result.
		box, err = io.ReadAll(response.Body)
		if err != nil {
			return nil, err
		}
	}

	value, err := protocolfiles.OpenFile(box, context.Keys[entry.Epoch], context.Checkpoint.IdKey, fileContext(context, entry), entry.BlobHash, name)
	if err != nil {
		return nil, err
	}

	if cached == nil {
		if err = statefiles.AtomicWrite(path, box, context.Options.Now); err != nil {
			return nil, err
		}
	}

	return value.Content, nil
}
