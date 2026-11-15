package epochs

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type EpochChange struct {
	Epoch     int
	KeyCommit []byte
	Wraps     []Wrap
}

var EpochChangeCodec = encoding.NewCodec(func(r *encoding.Reader) EpochChange {
	return EpochChange{
		Epoch:     encoding.U32.Read(r),
		KeyCommit: encoding.B32.Read(r),
		Wraps:     encoding.List(WrapCodec, func(a, c Wrap) int { return encoding.Compare(a.Recipient, c.Recipient) }).Read(r),
	}
}, func(v EpochChange) []byte {
	return encoding.Concat(
		encoding.U32.Write(v.Epoch),
		encoding.B32.Write(v.KeyCommit),
		encoding.List(WrapCodec, func(a, c Wrap) int { return encoding.Compare(a.Recipient, c.Recipient) }).Write(v.Wraps),
	)
}, nil)
