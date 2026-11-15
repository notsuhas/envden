package content

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/internal/validation"
)

type FileName struct {
	RepoId string
	Path   string
}

var FileNameCodec = encoding.NewCodec(func(r *encoding.Reader) FileName {
	encoding.Tagged(13, r)

	return FileName{RepoId: encoding.Str.Read(r), Path: encoding.Str.Read(r)}
}, func(v FileName) []byte {
	return encoding.Concat(encoding.Header(13), encoding.Str.Write(v.RepoId), encoding.Str.Write(v.Path))
}, func(v FileName) { validation.Path(v.Path) })
