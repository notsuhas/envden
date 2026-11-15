package keys

import (
	"crypto/ecdh"
	"crypto/ed25519"

	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type RecoveryKeys struct{ EncSk, ObjSk, EncPub, ObjPub []byte }
type DeviceKeys struct {
	RecoveryKeys
	ReqSk, ReqPub []byte
}

func GenerateRecoveryKeys(rng ...c.Random) (RecoveryKeys, error) {
	return b.Try(func() RecoveryKeys {
		r := c.RNG(rng)
		enc, obj := b.B32.Write(r(32)), b.B32.Write(r(32))
		sk := b.Must(ecdh.X25519().NewPrivateKey(enc))

		return RecoveryKeys{enc, obj, sk.PublicKey().Bytes(), ed25519.NewKeyFromSeed(obj).Public().(ed25519.PublicKey)}
	})
}

func GenerateDeviceKeys(rng ...c.Random) (DeviceKeys, error) {
	return b.Try(func() DeviceKeys {
		r := c.RNG(rng)
		k := b.Must(GenerateRecoveryKeys(r))
		req := b.B32.Write(r(32))

		return DeviceKeys{k, req, ed25519.NewKeyFromSeed(req).Public().(ed25519.PublicKey)}
	})
}
