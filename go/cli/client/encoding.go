package client

import (
	"encoding/base64"

	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func Text(data []byte) string { return base64.RawURLEncoding.EncodeToString(data) }

func Binary(text string) ([]byte, error) {
	data, err := base64.RawURLEncoding.DecodeString(text)
	if err != nil || Text(data) != text {
		return nil, errors.New(errors.InvalidData, "Invalid binary encoding")
	}

	return data, nil
}

func DecodeUntrusted[T any](codec encoding.Codec[T], raw []byte) (T, error) {
	value, err := encoding.Decode(codec, raw)
	if err != nil {
		return value, errors.Wrap(errors.InvalidData, "Invalid data from server", err)
	}

	return value, nil
}
