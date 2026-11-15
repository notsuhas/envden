package requests

import (
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func SignRequest(request s.Request, sk []byte) (b.Signed[s.Request], error) {
	return c.SignObject(s.RequestCodec, request, sk, "request")
}

func VerifyRequest(v b.Signed[s.Request], pub, pin, body []byte, now uint64, nonceSeen bool) (c.Verification[s.Request], error) {
	return VerifyRequestHash(v, pub, pin, c.SHA256(body), now, nonceSeen)
}

func VerifyRequestHash(v b.Signed[s.Request], pub, pin, bodyHash []byte, now uint64, nonceSeen bool) (c.Verification[s.Request], error) {
	if !b.Equal(v.Body.ServerPin, pin) || !b.Equal(v.Body.BodyHash, bodyHash) {
		return c.Verification[s.Request]{Reason: "Request binding mismatch"}, nil
	}
	valid := false
	if v.Body.Time >= now {
		valid = v.Body.Time-now < 300000
	} else {
		valid = now-v.Body.Time < 300000
	}
	if !valid || nonceSeen {
		return c.Verification[s.Request]{Reason: "Expired or replayed request"}, nil
	}
	return c.VerifyObject(s.RequestCodec, v, pub, "request")
}
