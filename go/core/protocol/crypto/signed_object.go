package crypto

import (
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func SignObject[T any](codec encoding.Codec[T], body T, sk []byte, label string) (encoding.Signed[T], error) {
	return encoding.Try(func() encoding.Signed[T] {
		return encoding.Signed[T]{Body: body, Signature: encoding.Must(Sign(sk, label, codec.Write(body)))}
	})
}

func VerifyObject[T any](codec encoding.Codec[T], v encoding.Signed[T], pub []byte, label string) (Verification[T], error) {
	raw, err := encoding.Encode(codec, v.Body)
	if err != nil {
		if enverrors.Is(err, enverrors.InvalidData) {
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

func ObjectHash[T any](codec encoding.Codec[T], v encoding.Signed[T], label string) ([]byte, error) {
	return encoding.Try(func() []byte {
		return H("hash/"+label, encoding.Concat(codec.Write(v.Body), encoding.B64.Write(v.Signature)))
	})
}
