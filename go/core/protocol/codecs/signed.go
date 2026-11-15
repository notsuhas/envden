package codecs

import b "github.com/notsuhas/envden/go/core/protocol/encoding"

type Signed[T any] = b.Signed[T]

func SignedCodec[T any](c b.Codec[T]) b.Codec[Signed[T]] { return b.SignedCodec(c) }
