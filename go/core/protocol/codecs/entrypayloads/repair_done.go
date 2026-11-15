package entrypayloads

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type RepairDone struct {
	RepairId     []byte
	RestoredHead []byte
}

var RepairDoneCodec = encoding.NewCodec(func(r *encoding.Reader) RepairDone {
	return RepairDone{RepairId: encoding.B32.Read(r), RestoredHead: encoding.B32.Read(r)}
}, func(v RepairDone) []byte {
	return encoding.Concat(encoding.B32.Write(v.RepairId), encoding.B32.Write(v.RestoredHead))
}, nil)
