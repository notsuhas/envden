package opaque

import (
	"crypto/hkdf"
	"crypto/sha512"

	o "github.com/bytemare/opaque"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"golang.org/x/crypto/argon2"
)

// bytemare authenticates this key but does not return it from GenerateKE3.
func loginServerPublicKey(password string, state, response []byte) []byte {
	conf := o.DefaultConfiguration()
	cl := b.Must(conf.Client())
	blind := b.Must(cl.Deserialize.DecodePrivateKey(state[:32]))
	evaluated := b.Must(cl.Deserialize.DecodePublicKey(response[:32]))
	output := conf.OPRF.OPRF().Finalize(blind, []byte(password), evaluated)
	stretched := argon2.IDKey(output, make([]byte, 16), 3, 65536, 4, 64)
	randomized := b.Must(hkdf.Extract(sha512.New, b.Concat(output, stretched), nil))
	masking := b.Must(hkdf.Expand(sha512.New, randomized, "MaskingKey", 64))
	pad := b.Must(hkdf.Expand(sha512.New, masking, string(b.Concat(response[32:64], []byte("CredentialResponsePad"))), 128))
	key := make([]byte, 32)
	for i := range key {
		key[i] = pad[i] ^ response[64+i]
	}
	return key
}
