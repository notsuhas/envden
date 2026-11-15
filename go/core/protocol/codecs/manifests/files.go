package manifests

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Files struct {
	Entries []FileEntry
}

var FilesCodec = encoding.NewCodec(func(r *encoding.Reader) Files {
	encoding.Tagged(3, r)

	return Files{Entries: encoding.List(FileEntryCodec, func(a, c FileEntry) int { return encoding.Compare(a.FileId, c.FileId) }).Read(r)}
}, func(v Files) []byte {
	return encoding.Concat(encoding.Header(3), encoding.List(FileEntryCodec, func(a, c FileEntry) int { return encoding.Compare(a.FileId, c.FileId) }).Write(v.Entries))
}, nil)
