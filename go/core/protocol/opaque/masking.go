package opaque

import (
	"crypto/hkdf"
	"crypto/sha512"

	o "github.com/bytemare/opaque"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"golang.org/x/crypto/argon2"
)

// bytemare authenticates this key but does not return it from GenerateKE3.
func loginServerPublicKey(password string, state, response []byte) []byte {
	conf := o.DefaultConfiguration()
	cl := encoding.Must(conf.Client())
	blind := encoding.Must(cl.Deserialize.DecodePrivateKey(state[:32]))
	evaluated := encoding.Must(cl.Deserialize.DecodePublicKey(response[:32]))
	output := conf.OPRF.OPRF().Finalize(blind, []byte(password), evaluated)
	stretched := argon2.IDKey(output, make([]byte, 16), 3, 65536, 4, 64)
	randomized := encoding.Must(hkdf.Extract(sha512.New, encoding.Concat(output, stretched), nil))
	masking := encoding.Must(hkdf.Expand(sha512.New, randomized, "MaskingKey", 64))
	pad := encoding.Must(hkdf.Expand(sha512.New, masking, string(encoding.Concat(response[32:64], []byte("CredentialResponsePad"))), 128))
	key := make([]byte, 32)
	for i := range key {
		key[i] = pad[i] ^ response[64+i]
	}

	return key
}
