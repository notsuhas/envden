package entrypayloads

import (
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Genesis struct {
	ServerPin  []byte
	Device     members.DeviceRecord
	Recovery   members.RecoveryRecord
	VaultNonce []byte
	CreatedAt  uint64
}

var GenesisCodec = encoding.NewCodec(func(r *encoding.Reader) Genesis {
	return Genesis{
		ServerPin:  encoding.B32.Read(r),
		Device:     members.DeviceRecordCodec.Read(r),
		Recovery:   members.RecoveryRecordCodec.Read(r),
		VaultNonce: encoding.B32.Read(r),
		CreatedAt:  encoding.U64.Read(r),
	}
}, func(v Genesis) []byte {
	return encoding.Concat(
		encoding.B32.Write(v.ServerPin),
		members.DeviceRecordCodec.Write(v.Device),
		members.RecoveryRecordCodec.Write(v.Recovery),
		encoding.B32.Write(v.VaultNonce),
		encoding.U64.Write(v.CreatedAt),
	)
}, nil)
