package entrypayloads

import (
	"github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type AddDevice struct {
	Device members.DeviceRecord
	Wrap   epochs.Wrap
}

var AddDeviceCodec = encoding.NewCodec(func(r *encoding.Reader) AddDevice {
	return AddDevice{Device: members.DeviceRecordCodec.Read(r), Wrap: epochs.WrapCodec.Read(r)}
}, func(v AddDevice) []byte {
	return encoding.Concat(members.DeviceRecordCodec.Write(v.Device), epochs.WrapCodec.Write(v.Wrap))
}, nil)
