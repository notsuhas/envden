package entrypayloads

import (
	members "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type Genesis struct {
	ServerPin  []byte
	Device     members.DeviceRecord
	Recovery   members.RecoveryRecord
	VaultNonce []byte
	CreatedAt  uint64
}

var GenesisCodec = b.NewCodec(func(r *b.Reader) Genesis {
	return Genesis{
		ServerPin:  b.B32.Read(r),
		Device:     members.DeviceRecordCodec.Read(r),
		Recovery:   members.RecoveryRecordCodec.Read(r),
		VaultNonce: b.B32.Read(r),
		CreatedAt:  b.U64.Read(r),
	}
}, func(v Genesis) []byte {
	return b.Concat(
		b.B32.Write(v.ServerPin),
		members.DeviceRecordCodec.Write(v.Device),
		members.RecoveryRecordCodec.Write(v.Recovery),
		b.B32.Write(v.VaultNonce),
		b.U64.Write(v.CreatedAt),
	)
}, nil)
