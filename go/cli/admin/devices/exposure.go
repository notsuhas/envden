package devices

import (
	"context"
	"sort"

	"github.com/notsuhas/envden/go/cli/admin/shared"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/history/versions"
	"github.com/notsuhas/envden/go/core/merge"
	protocolfiles "github.com/notsuhas/envden/go/core/protocol/files"
)

type ExposedFile struct {
	RepoID string   `json:"repoId"`
	Path   string   `json:"path"`
	Keys   []string `json:"keys"`
}

type Exposure struct {
	Files      []ExposedFile `json:"files"`
	Incomplete bool          `json:"incomplete"`
}

func ExposedNames(ctx context.Context, c *shared.Context, h shared.History) (Exposure, error) {
	result := Exposure{Files: []ExposedFile{}}
	material, err := shared.CurrentMaterial(ctx, c, h)
	if err != nil {
		return result, err
	}

	lists, blobs := map[string]bool{}, map[string]bool{}
	indexes := map[string]int{}
	keys := []map[string]bool{}
	for _, header := range h.Headers {
		hash := client.Text(header.Body.FilesHash)
		if lists[hash] {
			continue
		}

		lists[hash] = true
		files, e := versions.RetainedList(ctx, c.Client, header.Body.FilesHash)
		if e != nil {
			return result, e
		}

		if files == nil {
			result.Incomplete = true
			continue
		}

		for _, entry := range files.Entries {
			blob := client.Text(entry.BlobHash)
			if blobs[blob] {
				continue
			}

			blobs[blob] = true
			fc := protocolfiles.FileContext{VaultId: c.VaultID, Epoch: entry.Epoch, FileId: entry.FileId, Version: entry.Version}
			key := material.Keys[entry.Epoch]
			if key == nil {
				result.Incomplete = true
				continue
			}

			name, e := protocolfiles.OpenFileName(entry.Name, key, material.Ring.IdKey, fc)
			if e != nil {
				result.Incomplete = true
				continue
			}

			id := client.Text(entry.FileId)
			i, ok := indexes[id]
			if !ok {
				i = len(result.Files)
				indexes[id] = i
				result.Files = append(result.Files, ExposedFile{RepoID: name.RepoId, Path: name.Path, Keys: []string{}})
				keys = append(keys, map[string]bool{})
			}

			if entry.State != 1 && entry.State != 3 {
				continue
			}

			box, e := shared.OptionalObject(ctx, c.Client, "/v1/blobs/"+blob)
			if e != nil {
				return result, e
			}

			if box == nil {
				result.Incomplete = true
				continue
			}

			opened, e := protocolfiles.OpenFile(box, key, material.Ring.IdKey, fc, entry.BlobHash, name)
			if e != nil {
				return result, e
			}

			parsed := merge.ParseEnv(opened.Content)
			if parsed.Kind != "parsed" {
				result.Incomplete = true
				continue
			}

			for _, assignment := range parsed.Entries {
				keys[i][assignment.Key] = true
			}
		}
	}

	for i := range result.Files {
		for key := range keys[i] {
			result.Files[i].Keys = append(result.Files[i].Keys, key)
		}

		sort.Strings(result.Files[i].Keys)
	}

	return result, nil
}
