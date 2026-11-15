package pairing

import (
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type PairJoiner struct {
	Device members.DeviceRecord
}

var PairJoinerCodec = encoding.NewCodec(func(r *encoding.Reader) PairJoiner {
	encoding.Tagged(7, r)

	return PairJoiner{Device: members.DeviceRecordCodec.Read(r)}
}, func(v PairJoiner) []byte {
	return encoding.Concat(encoding.Header(7), members.DeviceRecordCodec.Write(v.Device))
}, nil)
