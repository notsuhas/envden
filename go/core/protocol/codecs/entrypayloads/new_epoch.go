package entrypayloads

import (
	epochs "github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type NewEpoch struct {
	Change epochs.EpochChange
}

var NewEpochCodec = b.NewCodec(func(r *b.Reader) NewEpoch { return NewEpoch{Change: epochs.EpochChangeCodec.Read(r)} }, func(v NewEpoch) []byte { return b.Concat(epochs.EpochChangeCodec.Write(v.Change)) }, nil)
