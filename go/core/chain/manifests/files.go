package manifests

import (
	s "github.com/notsuhas/envden/go/core/chain/shared"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func CheckedFiles(files *m.Files, hash []byte) (m.Files, error) {

	return s.Try(func() m.Files {
		s.Check(files != nil && b.Equal(cr.H("files", m.FilesCodec.Write(*files)), hash))
		return *files
	})
}

func ChangedFiles(before, after m.Files, minimumEpoch, epoch int, op ...int) ([]m.FileEntry, error) {

	return s.Try(func() []m.FileEntry {
		m.FilesCodec.Write(before)
		m.FilesCodec.Write(after)
		old := map[string]m.FileEntry{}
		next := map[string]bool{}
		for _, e := range before.Entries {
			old[s.ID(e.FileId)] = e
		}
		for _, e := range after.Entries {
			next[s.ID(e.FileId)] = true
		}
		for _, e := range before.Entries {
			s.Check(next[s.ID(e.FileId)])
		}
		changed := []m.FileEntry{}
		for _, entry := range after.Entries {
			previous, ok := old[s.ID(entry.FileId)]
			if ok && b.Equal(m.FileEntryCodec.Write(previous), m.FileEntryCodec.Write(entry)) {
				continue
			}
			s.Check(!ok || entry.Version > previous.Version)
			s.Check(!ok || !b.Equal(entry.Name, previous.Name))
			s.Check(entry.Epoch >= minimumEpoch && entry.Epoch <= epoch)
			if len(op) > 0 {
				s.Check(entry.Epoch == epoch)
				if op[0] == 11 {
					s.Check(ok && (previous.State == 1 || previous.State == 3) && (entry.State == 3 || entry.State == 4))
				} else {
					s.Check(entry.State == 1 || entry.State == 2)
				}
			}
			changed = append(changed, entry)
		}
		return changed
	})
}
