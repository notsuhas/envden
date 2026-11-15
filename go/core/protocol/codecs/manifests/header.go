package manifests

import (
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
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

var ManifestHeaderCodec = encoding.NewCodec(func(r *encoding.Reader) ManifestHeader {
	encoding.Tagged(2, r)

	return ManifestHeader{
		VaultId:      encoding.B32.Read(r),
		Seq:          encoding.U64.Read(r),
		Op:           encoding.U8.Read(r),
		Prev:         encoding.B32.Read(r),
		ListSeq:      encoding.U64.Read(r),
		ListHead:     encoding.B32.Read(r),
		Epoch:        encoding.U32.Read(r),
		KeyringHash:  encoding.B32.Read(r),
		FilesHash:    encoding.B32.Read(r),
		EnvelopeHash: encoding.B32.Read(r),
		CreatedAt:    encoding.U64.Read(r),
		Signer:       encoding.B16.Read(r),
	}
}, func(v ManifestHeader) []byte {
	return encoding.Concat(
		encoding.Header(2),
		encoding.B32.Write(v.VaultId),
		encoding.U64.Write(v.Seq),
		encoding.U8.Write(v.Op),
		encoding.B32.Write(v.Prev),
		encoding.U64.Write(v.ListSeq),
		encoding.B32.Write(v.ListHead),
		encoding.U32.Write(v.Epoch),
		encoding.B32.Write(v.KeyringHash),
		encoding.B32.Write(v.FilesHash),
		encoding.B32.Write(v.EnvelopeHash),
		encoding.U64.Write(v.CreatedAt),
		encoding.B16.Write(v.Signer),
	)
}, func(v ManifestHeader) {
	if v.Op > 13 {
		panic(enverrors.New(enverrors.UpdateRequired, "Unknown operation"))
	}
})
