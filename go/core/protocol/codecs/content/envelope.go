package content

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Envelope struct {
	VaultId       []byte
	RecoveryEncSk []byte
	RecoveryObjSk []byte
	Checkpoint    []byte
	SealedAt      uint64
}

var EnvelopeCodec = b.NewCodec(func(r *b.Reader) Envelope {
	b.Tagged(5, r)

	return Envelope{
		VaultId:       b.B32.Read(r),
		RecoveryEncSk: b.B32.Read(r),
		RecoveryObjSk: b.B32.Read(r),
		Checkpoint:    b.B32.Read(r),
		SealedAt:      b.U64.Read(r),
	}
}, func(v Envelope) []byte {
	return b.Concat(
		b.Header(5),
		b.B32.Write(v.VaultId),
		b.B32.Write(v.RecoveryEncSk),
		b.B32.Write(v.RecoveryObjSk),
		b.B32.Write(v.Checkpoint),
		b.U64.Write(v.SealedAt),
	)
}, nil)
