package validation

import (
	"bytes"
	"crypto/ecdh"

	"filippo.io/edwards25519"
	e "github.com/notsuhas/envden/go/core/errors"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func EdPublic(key []byte) {
	b.B32.Write(key)
	p, err := new(edwards25519.Point).SetBytes(key)
	if err != nil || !bytes.Equal(p.Bytes(), key) {
		panic(e.Wrap(e.InvalidData, "Invalid public key", err))
	}
	b.RequireValue(new(edwards25519.Point).MultByCofactor(p).Equal(edwards25519.NewIdentityPoint()) != 1, "Small order public key")
}

func EncPublic(key []byte) {
	b.B32.Write(key)
	p := bytes.Repeat([]byte{255}, 32)
	p[0] = 237
	p[31] = 127
	for i := 31; i >= 0; i-- {
		if key[i] < p[i] {
			break
		}
		if key[i] > p[i] || i == 0 {
			b.RequireValue(false, "Noncanonical encryption public key")
		}
	}
	pub, err := ecdh.X25519().NewPublicKey(key)
	if err == nil {
		sk, _ := ecdh.X25519().NewPrivateKey(make([]byte, 32))
		_, err = sk.ECDH(pub)
	}
	if err != nil {
		panic(e.Wrap(e.InvalidData, "Invalid encryption public key", err))
	}
}
