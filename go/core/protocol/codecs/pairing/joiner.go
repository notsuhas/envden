package pairing

import (
	members "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type PairJoiner struct {
	Device members.DeviceRecord
}

var PairJoinerCodec = b.NewCodec(func(r *b.Reader) PairJoiner {
	b.Tagged(7, r)

	return PairJoiner{Device: members.DeviceRecordCodec.Read(r)}
}, func(v PairJoiner) []byte { return b.Concat(b.Header(7), members.DeviceRecordCodec.Write(v.Device)) }, nil)
