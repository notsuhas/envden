package content

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Envelope struct {
	VaultId       []byte
	RecoveryEncSk []byte
	RecoveryObjSk []byte
	Checkpoint    []byte
	SealedAt      uint64
}

var EnvelopeCodec = encoding.NewCodec(func(r *encoding.Reader) Envelope {
	encoding.Tagged(5, r)

	return Envelope{
		VaultId:       encoding.B32.Read(r),
		RecoveryEncSk: encoding.B32.Read(r),
		RecoveryObjSk: encoding.B32.Read(r),
		Checkpoint:    encoding.B32.Read(r),
		SealedAt:      encoding.U64.Read(r),
	}
}, func(v Envelope) []byte {
	return encoding.Concat(
		encoding.Header(5),
		encoding.B32.Write(v.VaultId),
		encoding.B32.Write(v.RecoveryEncSk),
		encoding.B32.Write(v.RecoveryObjSk),
		encoding.B32.Write(v.Checkpoint),
		encoding.U64.Write(v.SealedAt),
	)
}, nil)
