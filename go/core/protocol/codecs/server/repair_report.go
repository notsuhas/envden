package server

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type RepairReport struct {
	VaultId  []byte
	RepairId []byte
	Head     []byte
	Blobs    [][]byte
	Signer   []byte
}

var RepairReportCodec = b.NewCodec(func(r *b.Reader) RepairReport {
	b.Tagged(11, r)

	return RepairReport{
		VaultId:  b.B32.Read(r),
		RepairId: b.B32.Read(r),
		Head:     b.B32.Read(r),
		Blobs:    b.List(b.B32, b.Compare).Read(r),
		Signer:   b.B16.Read(r),
	}
}, func(v RepairReport) []byte {
	return b.Concat(
		b.Header(11),
		b.B32.Write(v.VaultId),
		b.B32.Write(v.RepairId),
		b.B32.Write(v.Head),
		b.List(b.B32, b.Compare).Write(v.Blobs),
		b.B16.Write(v.Signer),
	)
}, nil)
