package members

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/internal/validation"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

type RecoveryRecord struct {
	Id     []byte
	EncPub []byte
	ObjPub []byte
}

var RecoveryRecordCodec = encoding.NewCodec(func(r *encoding.Reader) RecoveryRecord {
	return RecoveryRecord{Id: encoding.B16.Read(r), EncPub: encoding.B32.Read(r), ObjPub: encoding.B32.Read(r)}
}, func(v RecoveryRecord) []byte {
	return encoding.Concat(encoding.B16.Write(v.Id), encoding.B32.Write(v.EncPub), encoding.B32.Write(v.ObjPub))
}, func(v RecoveryRecord) {
	validation.EncPublic(v.EncPub)
	validation.EdPublic(v.ObjPub)
	encoding.RequireValue(encoding.Compare(v.Id, encoding.Must(keys.RecoveryID(v.EncPub, v.ObjPub))) == 0, "Recovery ID mismatch")
})
