package content

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	validation "github.com/notsuhas/envden/go/core/protocol/internal/validation"
)

type File struct {
	RepoId  string
	Path    string
	Content []byte
}

var FileCodec = b.NewCodec(func(r *b.Reader) File {
	b.Tagged(6, r)

	return File{RepoId: b.Str.Read(r), Path: b.Str.Read(r), Content: b.Sized(1048576).Read(r)}
}, func(v File) []byte {
	return b.Concat(b.Header(6), b.Str.Write(v.RepoId), b.Str.Write(v.Path), b.Sized(1048576).Write(v.Content))
}, func(v File) { validation.Path(v.Path) })
