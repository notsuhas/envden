package epochs

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type OlderKey struct {
	Epoch int
	Key   []byte
}

var OlderKeyCodec = b.NewCodec(func(r *b.Reader) OlderKey { return OlderKey{Epoch: b.U32.Read(r), Key: b.B32.Read(r)} }, func(v OlderKey) []byte { return b.Concat(b.U32.Write(v.Epoch), b.B32.Write(v.Key)) }, nil)
