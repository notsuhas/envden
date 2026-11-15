package epochs

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type OlderKey struct {
	Epoch int
	Key   []byte
}

var OlderKeyCodec = encoding.NewCodec(func(r *encoding.Reader) OlderKey {
	return OlderKey{Epoch: encoding.U32.Read(r), Key: encoding.B32.Read(r)}
}, func(v OlderKey) []byte {
	return encoding.Concat(encoding.U32.Write(v.Epoch), encoding.B32.Write(v.Key))
}, nil)
