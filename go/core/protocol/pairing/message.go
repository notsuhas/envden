package pairing

import (
	d "github.com/notsuhas/envden/go/core/protocol/codecs/pairing"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func seal[T any](codec b.Codec[T], v T, key []byte, rng []c.Random) ([]byte, error) {
	return b.Try(func() []byte {
		box := b.Must(c.SealBox(key, codec.Write(v), nil, rng...))
		b.RequireValue(len(box) <= 4096, "Pair message limit")

		return box
	})
}

func open[T any](codec b.Codec[T], box, key []byte) (T, error) {
	return b.Try(func() T {
		b.RequireValue(len(box) <= 4096, "Pair message limit")

		return b.Must(b.Decode(codec, b.Must(c.OpenBox(key, box, nil))))
	})
}

func SealPairJoiner(v d.PairJoiner, key []byte, rng ...c.Random) ([]byte, error) {
	return seal(d.PairJoinerCodec, v, key, rng)
}

func SealPairApprover(v d.PairApprover, key []byte, rng ...c.Random) ([]byte, error) {
	return seal(d.PairApproverCodec, v, key, rng)
}

func OpenPairJoiner(box, key []byte) (d.PairJoiner, error) { return open(d.PairJoinerCodec, box, key) }

func OpenPairApprover(box, key []byte) (d.PairApprover, error) {
	return open(d.PairApproverCodec, box, key)
}
