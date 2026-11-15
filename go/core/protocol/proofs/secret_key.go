package proofs

import (
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

func SignSKProof(secret, vaultID []byte, request s.Request) ([]byte, error) {
	return b.Try(func() []byte {
		return b.Must(c.Sign(b.Must(keys.SKSeed(secret, vaultID)), "sk-proof", s.RequestCodec.Write(request)))
	})
}

func VerifySKProof(pub []byte, request s.Request, proof []byte) (c.Verification[bool], error) {
	return b.Try(func() c.Verification[bool] { return c.Verify(pub, "sk-proof", s.RequestCodec.Write(request), proof) })
}
