package entrypayloads

import (
	"github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type RemoveDevice struct {
	Device      []byte
	NewRecovery *members.RecoveryRecord
	Change      epochs.EpochChange
}

var RemoveDeviceCodec = encoding.NewCodec(func(r *encoding.Reader) RemoveDevice {
	return RemoveDevice{
		Device:      encoding.B16.Read(r),
		NewRecovery: encoding.Opt(members.RecoveryRecordCodec).Read(r),
		Change:      epochs.EpochChangeCodec.Read(r),
	}
}, func(v RemoveDevice) []byte {
	return encoding.Concat(encoding.B16.Write(v.Device), encoding.Opt(members.RecoveryRecordCodec).Write(v.NewRecovery), epochs.EpochChangeCodec.Write(v.Change))
}, nil)
