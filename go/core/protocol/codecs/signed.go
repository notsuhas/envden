package codecs

import encoding "github.com/notsuhas/envden/go/core/protocol/encoding"

type Signed[T any] = encoding.Signed[T]

func SignedCodec[T any](c encoding.Codec[T]) encoding.Codec[Signed[T]] {
	return encoding.SignedCodec(c)
}
