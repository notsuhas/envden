package epochs

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Wrap struct {
	Recipient []byte
	Enc       []byte
	Ct        []byte
}

var WrapCodec = b.NewCodec(func(r *b.Reader) Wrap { return Wrap{Recipient: b.B16.Read(r), Enc: b.B32.Read(r), Ct: b.Bytes.Read(r)} }, func(v Wrap) []byte {
	return b.Concat(b.B16.Write(v.Recipient), b.B32.Write(v.Enc), b.Bytes.Write(v.Ct))
}, func(v Wrap) { b.RequireValue(len(v.Ct) == 48, "Invalid wrap ciphertext") })
