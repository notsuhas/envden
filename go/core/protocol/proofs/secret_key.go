package proofs

import (
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

func SignSKProof(secret, vaultID []byte, request wire.Request) ([]byte, error) {
	return encoding.Try(func() []byte {
		return encoding.Must(crypto.Sign(encoding.Must(keys.SKSeed(secret, vaultID)), "sk-proof", wire.RequestCodec.Write(request)))
	})
}

func VerifySKProof(pub []byte, request wire.Request, proof []byte) (crypto.Verification[bool], error) {
	return encoding.Try(func() crypto.Verification[bool] {
		return crypto.Verify(pub, "sk-proof", wire.RequestCodec.Write(request), proof)
	})
}
