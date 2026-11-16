package conflicts

import (
	"bytes"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/client"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func EntryAuthor(context *syncmodel.Context, entry manifests.FileEntry) (string, error) {
	var signer []byte

	for i := len(context.Headers) - 1; i >= 0; i-- {
		header := context.Headers[i]
		files := context.Checkpoint.Files

		if !bytes.Equal(header.Body.FilesHash, context.Checkpoint.Header.Body.FilesHash) {
			saved, err := localfiles.ReadBytes(filepath.Join(context.Adapters.Home, "state", "file-lists", client.Text(header.Body.FilesHash)))
			if err != nil {
				return "", err
			}

			if saved == nil {
				return "", nil
			}

			files, err = encoding.Decode(manifests.FilesCodec, saved)
			if err != nil {
				return "", nil //nolint:nilerr // Corrupt cached history leaves the author unknown, matching TypeScript.
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

	device, ok := context.Checkpoint.State.Devices[encoding.Base32(signer)]

	if !ok {
		return "", nil
	}

	return device.Name, nil
}
