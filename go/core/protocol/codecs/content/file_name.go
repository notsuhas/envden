package content

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	validation "github.com/notsuhas/envden/go/core/protocol/internal/validation"
)

type FileName struct {
	RepoId string
	Path   string
}

var FileNameCodec = b.NewCodec(func(r *b.Reader) FileName {
	b.Tagged(13, r)

	return FileName{RepoId: b.Str.Read(r), Path: b.Str.Read(r)}
}, func(v FileName) []byte { return b.Concat(b.Header(13), b.Str.Write(v.RepoId), b.Str.Write(v.Path)) }, func(v FileName) { validation.Path(v.Path) })
