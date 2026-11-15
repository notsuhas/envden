package pairing

import (
	"github.com/notsuhas/envden/go/core/protocol/codecs/pairing"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func seal[T any](codec encoding.Codec[T], v T, key []byte, rng []crypto.Random) ([]byte, error) {
	return encoding.Try(func() []byte {
		box := encoding.Must(crypto.SealBox(key, codec.Write(v), nil, rng...))
		encoding.RequireValue(len(box) <= 4096, "Pair message limit")

		return box
	})
}

func open[T any](codec encoding.Codec[T], box, key []byte) (T, error) {
	return encoding.Try(func() T {
		encoding.RequireValue(len(box) <= 4096, "Pair message limit")

		return encoding.Must(encoding.Decode(codec, encoding.Must(crypto.OpenBox(key, box, nil))))
	})
}

func SealPairJoiner(v pairing.PairJoiner, key []byte, rng ...crypto.Random) ([]byte, error) {
	return seal(pairing.PairJoinerCodec, v, key, rng)
}

func SealPairApprover(v pairing.PairApprover, key []byte, rng ...crypto.Random) ([]byte, error) {
	return seal(pairing.PairApproverCodec, v, key, rng)
}

func OpenPairJoiner(box, key []byte) (pairing.PairJoiner, error) {
	return open(pairing.PairJoinerCodec, box, key)
}

func OpenPairApprover(box, key []byte) (pairing.PairApprover, error) {
	return open(pairing.PairApproverCodec, box, key)
}
