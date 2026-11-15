package identity

import (
	"bytes"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

type SecretKeys struct{ EncSk, ObjSk, ReqSk []byte }
type Identity struct {
	Keys   SecretKeys
	Record members.DeviceRecord
}

func IdentityBytes(keys SecretKeys, record members.DeviceRecord) ([]byte, error) {
	encoded, err := b.Encode(members.DeviceRecordCodec, record)
	if err != nil {
		return nil, err
	}
	return b.Concat(keys.EncSk, keys.ObjSk, keys.ReqSk, encoded), nil
}
func ReadIdentity(stored []byte) (Identity, error) {
	if len(stored) < 96 {
		return Identity{}, errors.New(errors.InvalidData, "Invalid device identity")
	}
	secret := SecretKeys{bytes.Clone(stored[:32]), bytes.Clone(stored[32:64]), bytes.Clone(stored[64:96])}
	record, err := b.Decode(members.DeviceRecordCodec, stored[96:])
	if err != nil {
		return Identity{}, err
	}
	seeds := [][]byte{secret.EncSk, secret.ObjSk, secret.ReqSk}
	cursor := 0
	derived, err := keys.GenerateDeviceKeys(func(n int) []byte { v := seeds[cursor]; cursor++; return v })
	if err != nil {
		return Identity{}, err
	}
	if !bytes.Equal(derived.EncPub, record.EncPub) || !bytes.Equal(derived.ObjPub, record.ObjPub) || !bytes.Equal(derived.ReqPub, record.ReqPub) {
		return Identity{}, errors.New(errors.InvalidData, "Device keys do not match their public record")
	}
	id, err := keys.DeviceID(record.EncPub, record.ObjPub, record.ReqPub)
	if err != nil {
		return Identity{}, err
	}
	if !bytes.Equal(id, record.Id) {
		return Identity{}, errors.New(errors.InvalidData, "Invalid device identity")
	}
	return Identity{secret, record}, nil
}
