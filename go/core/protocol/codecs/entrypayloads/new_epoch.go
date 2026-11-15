package entrypayloads

import (
	"github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type NewEpoch struct {
	Change epochs.EpochChange
}

var NewEpochCodec = encoding.NewCodec(func(r *encoding.Reader) NewEpoch { return NewEpoch{Change: epochs.EpochChangeCodec.Read(r)} }, func(v NewEpoch) []byte { return encoding.Concat(epochs.EpochChangeCodec.Write(v.Change)) }, nil)
