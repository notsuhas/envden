package members

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	validation "github.com/notsuhas/envden/go/core/protocol/internal/validation"
	keys "github.com/notsuhas/envden/go/core/protocol/keys"
)

type DeviceRecord struct {
	Id     []byte
	Name   string
	EncPub []byte
	ObjPub []byte
	ReqPub []byte
}

var DeviceRecordCodec = b.NewCodec(func(r *b.Reader) DeviceRecord {
	return DeviceRecord{Id: b.B16.Read(r), Name: b.Str.Read(r), EncPub: b.B32.Read(r), ObjPub: b.B32.Read(r), ReqPub: b.B32.Read(r)}
}, func(v DeviceRecord) []byte {
	return b.Concat(b.B16.Write(v.Id), b.Str.Write(v.Name), b.B32.Write(v.EncPub), b.B32.Write(v.ObjPub), b.B32.Write(v.ReqPub))
}, func(v DeviceRecord) {
	b.RequireValue(IsDeviceName(v.Name), "Invalid device name")
	validation.EncPublic(v.EncPub)
	validation.EdPublic(v.ObjPub)
	validation.EdPublic(v.ReqPub)
	b.RequireValue(b.Compare(v.Id, b.Must(keys.DeviceID(v.EncPub, v.ObjPub, v.ReqPub))) == 0, "Device ID mismatch")
})
