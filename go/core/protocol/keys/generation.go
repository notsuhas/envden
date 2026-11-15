package keys

import (
	"crypto/ecdh"
	"crypto/ed25519"

	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type RecoveryKeys struct{ EncSk, ObjSk, EncPub, ObjPub []byte }

type DeviceKeys struct {
	RecoveryKeys
	ReqSk, ReqPub []byte
}

func GenerateRecoveryKeys(rng ...crypto.Random) (RecoveryKeys, error) {
	return encoding.Try(func() RecoveryKeys {
		r := crypto.RNG(rng)
		enc, obj := encoding.B32.Write(r(32)), encoding.B32.Write(r(32))
		sk := encoding.Must(ecdh.X25519().NewPrivateKey(enc))

		return RecoveryKeys{enc, obj, sk.PublicKey().Bytes(), ed25519.NewKeyFromSeed(obj).Public().(ed25519.PublicKey)}
	})
}

func GenerateDeviceKeys(rng ...crypto.Random) (DeviceKeys, error) {
	return encoding.Try(func() DeviceKeys {
		r := crypto.RNG(rng)
		k := encoding.Must(GenerateRecoveryKeys(r))
		req := encoding.B32.Write(r(32))

		return DeviceKeys{k, req, ed25519.NewKeyFromSeed(req).Public().(ed25519.PublicKey)}
	})
}
