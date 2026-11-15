package server

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type RepairReport struct {
	VaultId  []byte
	RepairId []byte
	Head     []byte
	Blobs    [][]byte
	Signer   []byte
}

var RepairReportCodec = encoding.NewCodec(func(r *encoding.Reader) RepairReport {
	encoding.Tagged(11, r)

	return RepairReport{
		VaultId:  encoding.B32.Read(r),
		RepairId: encoding.B32.Read(r),
		Head:     encoding.B32.Read(r),
		Blobs:    encoding.List(encoding.B32, encoding.Compare).Read(r),
		Signer:   encoding.B16.Read(r),
	}
}, func(v RepairReport) []byte {
	return encoding.Concat(
		encoding.Header(11),
		encoding.B32.Write(v.VaultId),
		encoding.B32.Write(v.RepairId),
		encoding.B32.Write(v.Head),
		encoding.List(encoding.B32, encoding.Compare).Write(v.Blobs),
		encoding.B16.Write(v.Signer),
	)
}, nil)
