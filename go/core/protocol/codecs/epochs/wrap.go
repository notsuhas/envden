package epochs

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Wrap struct {
	Recipient []byte
	Enc       []byte
	Ct        []byte
}

var WrapCodec = encoding.NewCodec(func(r *encoding.Reader) Wrap {
	return Wrap{Recipient: encoding.B16.Read(r), Enc: encoding.B32.Read(r), Ct: encoding.Bytes.Read(r)}
}, func(v Wrap) []byte {
	return encoding.Concat(encoding.B16.Write(v.Recipient), encoding.B32.Write(v.Enc), encoding.Bytes.Write(v.Ct))
}, func(v Wrap) { encoding.RequireValue(len(v.Ct) == 48, "Invalid wrap ciphertext") })
