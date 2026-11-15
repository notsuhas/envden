package entrypayloads

import (
	members "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type RenameDevice struct {
	Device []byte
	Name   string
}

var RenameDeviceCodec = b.NewCodec(func(r *b.Reader) RenameDevice { return RenameDevice{Device: b.B16.Read(r), Name: b.Str.Read(r)} }, func(v RenameDevice) []byte { return b.Concat(b.B16.Write(v.Device), b.Str.Write(v.Name)) }, func(v RenameDevice) { b.RequireValue(members.IsDeviceName(v.Name), "Invalid device name") })
