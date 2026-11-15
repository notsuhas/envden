package content

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/internal/validation"
)

type File struct {
	RepoId  string
	Path    string
	Content []byte
}

var FileCodec = encoding.NewCodec(func(r *encoding.Reader) File {
	encoding.Tagged(6, r)

	return File{RepoId: encoding.Str.Read(r), Path: encoding.Str.Read(r), Content: encoding.Sized(1048576).Read(r)}
}, func(v File) []byte {
	return encoding.Concat(encoding.Header(6), encoding.Str.Write(v.RepoId), encoding.Str.Write(v.Path), encoding.Sized(1048576).Write(v.Content))
}, func(v File) { validation.Path(v.Path) })
