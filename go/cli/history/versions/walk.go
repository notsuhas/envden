package versions

import (
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type WalkedVersion struct {
	Entry  manifests.FileEntry
	Header *encoding.Signed[manifests.ManifestHeader]
}

type Walk struct {
	Versions []WalkedVersion
	Pruned   bool
}

func WalkVersions(headers []encoding.Signed[manifests.ManifestHeader], ids [][]byte, list func([]byte) (*manifests.Files, error)) (map[string]*Walk, error) {
	walks := map[string]*Walk{}
	open := map[string][]byte{}
	order := []string{}
	for _, id := range ids {
		k := encoding.Base32(id)
		walks[k] = &Walk{Versions: []WalkedVersion{}}
		if _, ok := open[k]; !ok {
			order = append(order, k)
		}

		open[k] = id
	}

	lists := map[string]*manifests.Files{}
	for i := len(headers) - 1; i >= 0 && len(open) > 0; i-- {
		header := headers[i]
		hash := encoding.Base32(header.Body.FilesHash)
		files, ok := lists[hash]
		if !ok {
			var err error
			files, err = list(header.Body.FilesHash)
			if err != nil {
				return nil, err
			}

			lists[hash] = files
		}

		for _, id := range order {
			fileID, ok := open[id]
			if !ok {
				continue
			}

			walk := walks[id]
			if files == nil {
				walk.Pruned = true
				if len(walk.Versions) > 0 {
					walk.Versions[len(walk.Versions)-1].Header = nil
				}

				delete(open, id)
				continue
			}

			var entry *manifests.FileEntry
			for j := range files.Entries {
				if encoding.Equal(files.Entries[j].FileId, fileID) {
					entry = &files.Entries[j]
					break
				}
			}

			if entry == nil {
				delete(open, id)
				continue
			}

			if len(walk.Versions) > 0 && walk.Versions[len(walk.Versions)-1].Entry.Version == entry.Version {
				walk.Versions[len(walk.Versions)-1].Header = &header
			} else {
				walk.Versions = append(walk.Versions, WalkedVersion{*entry, &header})
			}
		}
	}

	return walks, nil
}
