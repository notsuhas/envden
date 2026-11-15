package unknown

import (
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/crypto/objects"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type DecodeInput[T any] struct {
	Received, Stored                     []byte
	Mismatch                             string
	Members                              []objects.Member
	Codec                                encoding.Codec[T]
	Label, CurrentVersion, LatestVersion string
}

type DecodeResult[T any] struct {
	Kind  string
	Value *codecs.Signed[T]
}

func DecodeServerObject[T any](input DecodeInput[T]) (DecodeResult[T], error) {
	raw := input.Received
	tag := byte(11)
	switch input.Label {
	case "entry":
		tag = 1
	case "manifest":
		tag = 2
	}
	unknown := len(raw) < 2 || raw[0] != tag || raw[1] != 1 || (input.Label == "entry" && len(raw) >= 155 && raw[74] > 7) || (input.Label == "manifest" && len(raw) >= 123 && raw[42] > 13)
	r, err := ClassifyUnknownData(Input{Received: raw, Stored: input.Stored, Mismatch: input.Mismatch, UnknownFormat: unknown, CurrentVersion: input.CurrentVersion, LatestVersion: input.LatestVersion, Verify: func() (bool, error) { return objects.VerifyRawObject(raw, input.Members, input.Label).OK, nil }})
	if err != nil {
		return DecodeResult[T]{}, err
	}
	if r.Kind != "known" {
		return DecodeResult[T]{Kind: r.Kind}, nil
	}
	var value codecs.Signed[T]
	ok := verified(func() (bool, error) {
		var err error
		value, err = encoding.Decode(codecs.SignedCodec(input.Codec), raw)

		return err == nil, err
	})
	if !ok {
		return DecodeResult[T]{Kind: "invalid"}, nil
	}

	return DecodeResult[T]{Kind: "known", Value: &value}, nil
}
