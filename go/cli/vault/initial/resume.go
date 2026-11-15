package initial

import (
	"context"
	"io"
	"os"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/state/model"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote"
	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	protocolfiles "github.com/notsuhas/envden/go/core/protocol/files"
)

func ResumeInitialFiles(ctx context.Context, a contracts.Adapters) error {
	c, err := remote.SyncContext(ctx, a, syncmodel.Options{Now: a.Now, Fetcher: a.Fetcher}, syncmodel.Links{})
	if err != nil {
		return err
	}

	if _, err = remote.AcceptHead(c, nil, false); err != nil {
		return err
	}

	header := c.Checkpoint.Header.Body
	if header.Seq != 2 || header.Op != 1 || !encoding.Equal(header.Signer, c.Identity.Record.Id) {
		return nil
	}

	bases := map[string][]byte{}
	for _, entry := range c.Checkpoint.Files.Entries {
		if entry.State != 1 {
			return nil
		}

		key := c.Keys[entry.Epoch]
		context := protocolfiles.FileContext{VaultId: c.VaultID, FileId: entry.FileId, Epoch: entry.Epoch, Version: entry.Version}
		name, err := protocolfiles.OpenFileName(entry.Name, key, c.Checkpoint.IdKey, context)
		if err != nil {
			return err
		}

		links := matchingLinks(c.State, name)
		if len(links) == 0 {
			return nil
		}

		response, err := c.Client.Request(ctx, "/v1/blobs/"+client.Text(entry.BlobHash), "GET", nil)
		if err != nil {
			return err
		}

		blob, err := io.ReadAll(response.Body)
		_ = response.Body.Close() // Best-effort cleanup preserves the original operation result.
		if err != nil {
			return err
		}

		file, err := protocolfiles.OpenFile(blob, key, c.Checkpoint.IdKey, context, entry.BlobHash, name)
		if err != nil {
			return err
		}

		for _, link := range links {
			path := link.Store
			if link.Mode == "copy" {
				path = filepath.Join(link.Root, link.Path)
			}

			local, err := os.ReadFile(path)
			if err != nil && !os.IsNotExist(err) {
				return err
			}

			if !localfiles.Same(local, file.Content) {
				return nil
			}

			bases[basePath(a.Home, link)] = file.Content
		}
	}

	if err = remote.PersistCheckpoint(c); err != nil {
		return err
	}

	return recordPushed(a.Home, c.Checkpoint.Files, bases, a.Now)
}

func matchingLinks(state *model.State, name content.FileName) []model.Link {
	result := []model.Link{}
	for _, link := range state.Links {
		if link.LocalOnly || link.Path != name.Path {
			continue
		}

		for _, checkout := range state.Approved {
			if checkout.Root != link.Root {
				continue
			}

			id := checkout.RepoID
			if alias, ok := state.Aliases.Get(id).(string); ok {
				id = alias
			}

			if id == name.RepoId {
				result = append(result, link)
			}

			break
		}
	}

	return result
}
