package members

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	validation "github.com/notsuhas/envden/go/core/protocol/internal/validation"
	keys "github.com/notsuhas/envden/go/core/protocol/keys"
)

type RecoveryRecord struct {
	Id     []byte
	EncPub []byte
	ObjPub []byte
}

var RecoveryRecordCodec = b.NewCodec(func(r *b.Reader) RecoveryRecord {
	return RecoveryRecord{Id: b.B16.Read(r), EncPub: b.B32.Read(r), ObjPub: b.B32.Read(r)}
}, func(v RecoveryRecord) []byte {
	return b.Concat(b.B16.Write(v.Id), b.B32.Write(v.EncPub), b.B32.Write(v.ObjPub))
}, func(v RecoveryRecord) {
	validation.EncPublic(v.EncPub)
	validation.EdPublic(v.ObjPub)
	b.RequireValue(b.Compare(v.Id, b.Must(keys.RecoveryID(v.EncPub, v.ObjPub))) == 0, "Recovery ID mismatch")
})
