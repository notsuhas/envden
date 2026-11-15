package manifests

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Files struct {
	Entries []FileEntry
}

var FilesCodec = b.NewCodec(func(r *b.Reader) Files {
	b.Tagged(3, r)

	return Files{Entries: b.List(FileEntryCodec, func(a, c FileEntry) int { return b.Compare(a.FileId, c.FileId) }).Read(r)}
}, func(v Files) []byte {
	return b.Concat(b.Header(3), b.List(FileEntryCodec, func(a, c FileEntry) int { return b.Compare(a.FileId, c.FileId) }).Write(v.Entries))
}, nil)
