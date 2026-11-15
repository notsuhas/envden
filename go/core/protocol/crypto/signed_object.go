package crypto

import (
	e "github.com/notsuhas/envden/go/core/errors"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func SignObject[T any](codec b.Codec[T], body T, sk []byte, label string) (b.Signed[T], error) {
	return b.Try(func() b.Signed[T] {
		return b.Signed[T]{Body: body, Signature: b.Must(Sign(sk, label, codec.Write(body)))}
	})
}

func VerifyObject[T any](codec b.Codec[T], v b.Signed[T], pub []byte, label string) (Verification[T], error) {
	raw, err := b.Encode(codec, v.Body)
	if err != nil {
		if e.Is(err, e.InvalidData) {
			return Verification[T]{Reason: "Malformed signed object"}, nil
		}
		return Verification[T]{}, err
	}
	r := Verify(pub, label, raw, v.Signature)
	if !r.OK {
		return Verification[T]{Reason: r.Reason}, nil
	}

	return Verification[T]{OK: true, Value: v.Body}, nil
}

func ObjectHash[T any](codec b.Codec[T], v b.Signed[T], label string) ([]byte, error) {
	return b.Try(func() []byte { return H("hash/"+label, b.Concat(codec.Write(v.Body), b.B64.Write(v.Signature))) })
}
