package entrypayloads

import (
	epochs "github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	members "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type AddDevice struct {
	Device members.DeviceRecord
	Wrap   epochs.Wrap
}

var AddDeviceCodec = b.NewCodec(func(r *b.Reader) AddDevice {
	return AddDevice{Device: members.DeviceRecordCodec.Read(r), Wrap: epochs.WrapCodec.Read(r)}
}, func(v AddDevice) []byte {
	return b.Concat(members.DeviceRecordCodec.Write(v.Device), epochs.WrapCodec.Write(v.Wrap))
}, nil)
