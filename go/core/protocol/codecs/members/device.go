package members

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/internal/validation"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

type DeviceRecord struct {
	Id     []byte
	Name   string
	EncPub []byte
	ObjPub []byte
	ReqPub []byte
}

var DeviceRecordCodec = encoding.NewCodec(func(r *encoding.Reader) DeviceRecord {
	return DeviceRecord{Id: encoding.B16.Read(r), Name: encoding.Str.Read(r), EncPub: encoding.B32.Read(r), ObjPub: encoding.B32.Read(r), ReqPub: encoding.B32.Read(r)}
}, func(v DeviceRecord) []byte {
	return encoding.Concat(encoding.B16.Write(v.Id), encoding.Str.Write(v.Name), encoding.B32.Write(v.EncPub), encoding.B32.Write(v.ObjPub), encoding.B32.Write(v.ReqPub))
}, func(v DeviceRecord) {
	encoding.RequireValue(IsDeviceName(v.Name), "Invalid device name")
	validation.EncPublic(v.EncPub)
	validation.EdPublic(v.ObjPub)
	validation.EdPublic(v.ReqPub)
	encoding.RequireValue(encoding.Compare(v.Id, encoding.Must(keys.DeviceID(v.EncPub, v.ObjPub, v.ReqPub))) == 0, "Device ID mismatch")
})
