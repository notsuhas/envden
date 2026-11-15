package epochs

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type EpochChange struct {
	Epoch     int
	KeyCommit []byte
	Wraps     []Wrap
}

var EpochChangeCodec = b.NewCodec(func(r *b.Reader) EpochChange {
	return EpochChange{
		Epoch:     b.U32.Read(r),
		KeyCommit: b.B32.Read(r),
		Wraps:     b.List(WrapCodec, func(a, c Wrap) int { return b.Compare(a.Recipient, c.Recipient) }).Read(r),
	}
}, func(v EpochChange) []byte {
	return b.Concat(
		b.U32.Write(v.Epoch),
		b.B32.Write(v.KeyCommit),
		b.List(WrapCodec, func(a, c Wrap) int { return b.Compare(a.Recipient, c.Recipient) }).Write(v.Wraps),
	)
}, nil)
