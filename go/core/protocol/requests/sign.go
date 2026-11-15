package requests

import (
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func SignRequest(request wire.Request, sk []byte) (encoding.Signed[wire.Request], error) {
	return crypto.SignObject(wire.RequestCodec, request, sk, "request")
}

func VerifyRequest(v encoding.Signed[wire.Request], pub, pin, body []byte, now uint64, nonceSeen bool) (crypto.Verification[wire.Request], error) {
	return VerifyRequestHash(v, pub, pin, crypto.SHA256(body), now, nonceSeen)
}

func VerifyRequestHash(v encoding.Signed[wire.Request], pub, pin, bodyHash []byte, now uint64, nonceSeen bool) (crypto.Verification[wire.Request], error) {
	if !encoding.Equal(v.Body.ServerPin, pin) || !encoding.Equal(v.Body.BodyHash, bodyHash) {
		return crypto.Verification[wire.Request]{Reason: "Request binding mismatch"}, nil
	}
	valid := false
	if v.Body.Time >= now {
		valid = v.Body.Time-now < 300000
	} else {
		valid = now-v.Body.Time < 300000
	}
	if !valid || nonceSeen {
		return crypto.Verification[wire.Request]{Reason: "Expired or replayed request"}, nil
	}

	return crypto.VerifyObject(wire.RequestCodec, v, pub, "request")
}
