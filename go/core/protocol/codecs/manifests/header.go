package manifests

import (
	e "github.com/notsuhas/envden/go/core/errors"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type ManifestHeader struct {
	VaultId      []byte
	Seq          uint64
	Op           int
	Prev         []byte
	ListSeq      uint64
	ListHead     []byte
	Epoch        int
	KeyringHash  []byte
	FilesHash    []byte
	EnvelopeHash []byte
	CreatedAt    uint64
	Signer       []byte
}

var ManifestHeaderCodec = b.NewCodec(func(r *b.Reader) ManifestHeader {
	b.Tagged(2, r)

	return ManifestHeader{
		VaultId:      b.B32.Read(r),
		Seq:          b.U64.Read(r),
		Op:           b.U8.Read(r),
		Prev:         b.B32.Read(r),
		ListSeq:      b.U64.Read(r),
		ListHead:     b.B32.Read(r),
		Epoch:        b.U32.Read(r),
		KeyringHash:  b.B32.Read(r),
		FilesHash:    b.B32.Read(r),
		EnvelopeHash: b.B32.Read(r),
		CreatedAt:    b.U64.Read(r),
		Signer:       b.B16.Read(r),
	}
}, func(v ManifestHeader) []byte {
	return b.Concat(
		b.Header(2),
		b.B32.Write(v.VaultId),
		b.U64.Write(v.Seq),
		b.U8.Write(v.Op),
		b.B32.Write(v.Prev),
		b.U64.Write(v.ListSeq),
		b.B32.Write(v.ListHead),
		b.U32.Write(v.Epoch),
		b.B32.Write(v.KeyringHash),
		b.B32.Write(v.FilesHash),
		b.B32.Write(v.EnvelopeHash),
		b.U64.Write(v.CreatedAt),
		b.B16.Write(v.Signer),
	)
}, func(v ManifestHeader) {
	if v.Op > 13 {
		panic(e.New(e.UpdateRequired, "Unknown operation"))
	}
})
