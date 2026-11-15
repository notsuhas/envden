package entrypayloads

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type RepairDone struct {
	RepairId     []byte
	RestoredHead []byte
}

var RepairDoneCodec = b.NewCodec(func(r *b.Reader) RepairDone { return RepairDone{RepairId: b.B32.Read(r), RestoredHead: b.B32.Read(r)} }, func(v RepairDone) []byte { return b.Concat(b.B32.Write(v.RepairId), b.B32.Write(v.RestoredHead)) }, nil)
