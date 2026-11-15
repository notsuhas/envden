package entrypayloads

import (
	epochs "github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	members "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type RemoveDevice struct {
	Device      []byte
	NewRecovery *members.RecoveryRecord
	Change      epochs.EpochChange
}

var RemoveDeviceCodec = b.NewCodec(func(r *b.Reader) RemoveDevice {
	return RemoveDevice{
		Device:      b.B16.Read(r),
		NewRecovery: b.Opt(members.RecoveryRecordCodec).Read(r),
		Change:      epochs.EpochChangeCodec.Read(r),
	}
}, func(v RemoveDevice) []byte {
	return b.Concat(b.B16.Write(v.Device), b.Opt(members.RecoveryRecordCodec).Write(v.NewRecovery), epochs.EpochChangeCodec.Write(v.Change))
}, nil)
