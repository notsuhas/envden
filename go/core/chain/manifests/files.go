package manifests

import (
	chainshared "github.com/notsuhas/envden/go/core/chain/shared"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func CheckedFiles(files *manifests.Files, hash []byte) (manifests.Files, error) {
	return chainshared.TryResult(func() (manifests.Files, error) {
		if err := chainshared.Check(files != nil && encoding.Equal(crypto.H("files", manifests.FilesCodec.Write(*files)), hash)); err != nil {
			return manifests.Files{}, err
		}

		return *files, nil
	})
}

func ChangedFiles(before, after manifests.Files, minimumEpoch, epoch int, op ...int) ([]manifests.FileEntry, error) {
	return chainshared.TryResult(func() ([]manifests.FileEntry, error) {
		manifests.FilesCodec.Write(before)
		manifests.FilesCodec.Write(after)
		old := map[string]manifests.FileEntry{}
		next := map[string]bool{}
		for _, e := range before.Entries {
			old[chainshared.ID(e.FileId)] = e
		}
		for _, e := range after.Entries {
			next[chainshared.ID(e.FileId)] = true
		}
		for _, e := range before.Entries {
			if err := chainshared.Check(next[chainshared.ID(e.FileId)]); err != nil {
				return nil, err
			}
		}
		changed := []manifests.FileEntry{}
		for _, entry := range after.Entries {
			previous, ok := old[chainshared.ID(entry.FileId)]
			if ok && encoding.Equal(manifests.FileEntryCodec.Write(previous), manifests.FileEntryCodec.Write(entry)) {
				continue
			}
			if err := chainshared.Check(!ok || entry.Version > previous.Version); err != nil {
				return nil, err
			}
			if err := chainshared.Check(!ok || !encoding.Equal(entry.Name, previous.Name)); err != nil {
				return nil, err
			}
			if err := chainshared.Check(entry.Epoch >= minimumEpoch && entry.Epoch <= epoch); err != nil {
				return nil, err
			}
			if len(op) > 0 {
				if err := chainshared.Check(entry.Epoch == epoch); err != nil {
					return nil, err
				}
				if op[0] == 11 {
					if err := chainshared.Check(ok && (previous.State == 1 || previous.State == 3) && (entry.State == 3 || entry.State == 4)); err != nil {
						return nil, err
					}
				} else {
					if err := chainshared.Check(entry.State == 1 || entry.State == 2); err != nil {
						return nil, err
					}
				}
			}
			changed = append(changed, entry)
		}

		return changed, nil
	})
}
