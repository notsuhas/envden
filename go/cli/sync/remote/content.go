package remote

import (
	"io"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/client"
	sf "github.com/notsuhas/envden/go/cli/state/files"
	f "github.com/notsuhas/envden/go/cli/sync/local/files"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	e "github.com/notsuhas/envden/go/core/errors"
	d "github.com/notsuhas/envden/go/core/protocol/codecs/content"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	pf "github.com/notsuhas/envden/go/core/protocol/files"
)

func fileContext(context *sm.Context, entry m.FileEntry) pf.FileContext {
	return pf.FileContext{VaultId: context.VaultID, Epoch: entry.Epoch, Version: entry.Version, FileId: entry.FileId}
}

func EntryName(context *sm.Context, entry m.FileEntry) (d.FileName, error) {
	key := context.Keys[entry.Epoch]
	if key == nil {
		return d.FileName{}, e.New(e.Locked, "Epoch key unavailable")
	}

	return pf.OpenFileName(entry.Name, key, context.Checkpoint.IdKey, fileContext(context, entry))
}

func ReadableEntries(context *sm.Context) ([]m.FileEntry, error) {
	entries := []m.FileEntry{}
	for _, entry := range context.Checkpoint.Files.Entries {
		_, err := EntryName(context, entry)
		if e.Is(err, e.Locked) {
			return nil, err
		}
		if err == nil {
			entries = append(entries, entry)
		}
	}

	return entries, nil
}

func EntryContent(context *sm.Context, entry m.FileEntry) ([]byte, error) {
	if entry.State == 2 || entry.State == 4 {
		return nil, nil
	}
	name, err := EntryName(context, entry)
	if err != nil {
		return nil, err
	}
	path := filepath.Join(context.Adapters.Home, "state", "blobs", client.Text(entry.BlobHash))
	cached, err := f.ReadBytes(path)
	if err != nil {
		return nil, err
	}
	box := cached
	if box == nil {
		response, err := context.Client.Request(context.Context, "/v1/blobs/"+client.Text(entry.BlobHash), "GET", nil)
		if err != nil {
			return nil, err
		}
		defer response.Body.Close()
		box, err = io.ReadAll(response.Body)
		if err != nil {
			return nil, err
		}
	}
	value, err := pf.OpenFile(box, context.Keys[entry.Epoch], context.Checkpoint.IdKey, fileContext(context, entry), entry.BlobHash, name)
	if err != nil {
		return nil, err
	}
	if cached == nil {
		if err = sf.AtomicWrite(path, box, context.Options.Now); err != nil {
			return nil, err
		}
	}

	return value.Content, nil
}
