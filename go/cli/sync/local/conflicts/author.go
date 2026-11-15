package conflicts

import (
	"bytes"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/client"
	f "github.com/notsuhas/envden/go/cli/sync/local/files"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func EntryAuthor(context *sm.Context, entry m.FileEntry) (string, error) {
	var signer []byte
	for i := len(context.Headers) - 1; i >= 0; i-- {
		header := context.Headers[i]
		files := context.Checkpoint.Files
		if !bytes.Equal(header.Body.FilesHash, context.Checkpoint.Header.Body.FilesHash) {
			saved, err := f.ReadBytes(filepath.Join(context.Adapters.Home, "state", "file-lists", client.Text(header.Body.FilesHash)))
			if err != nil {
				return "", err
			}
			if saved == nil {
				return "", nil
			}
			files, err = b.Decode(m.FilesCodec, saved)
			if err != nil {
				return "", nil
			}
		}
		found := false
		for _, v := range files.Entries {
			if bytes.Equal(v.FileId, entry.FileId) && v.Version == entry.Version {
				found = true
				break
			}
		}
		if !found {
			break
		}
		signer = header.Body.Signer
	}
	if signer == nil || bytes.Equal(signer, context.Identity.Record.Id) {
		return "", nil
	}
	device, ok := context.Checkpoint.State.Devices[b.Base32(signer)]
	if !ok {
		return "", nil
	}

	return device.Name, nil
}
