package entrypayloads

import (
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type RenameDevice struct {
	Device []byte
	Name   string
}

var RenameDeviceCodec = encoding.NewCodec(func(r *encoding.Reader) RenameDevice {
	return RenameDevice{Device: encoding.B16.Read(r), Name: encoding.Str.Read(r)}
}, func(v RenameDevice) []byte {
	return encoding.Concat(encoding.B16.Write(v.Device), encoding.Str.Write(v.Name))
}, func(v RenameDevice) { encoding.RequireValue(members.IsDeviceName(v.Name), "Invalid device name") })
