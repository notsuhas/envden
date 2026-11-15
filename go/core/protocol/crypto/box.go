package crypto

import (
	e "github.com/notsuhas/envden/go/core/errors"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"golang.org/x/crypto/chacha20poly1305"
)

func SealBox(key, plaintext, ad []byte, rng ...Random) ([]byte, error) {
	return b.Try(func() []byte {
		nonce := RNG(rng)(24)
		b.RequireValue(len(nonce) == 24)
		a := b.Must(chacha20poly1305.NewX(b.B32.Write(key)))

		return b.Concat([]byte{1}, nonce, a.Seal(nil, nonce, plaintext, ad))
	})
}

func OpenBox(key, box, ad []byte) ([]byte, error) {
	return b.Try(func() []byte {
		r := &b.Reader{Data: box}
		b.RequireValue(r.Take(1)[0] == 1, "Unknown blob version")
		nonce := r.Take(24)
		v, err := b.Try(func() []byte {
			a := b.Must(chacha20poly1305.NewX(b.B32.Write(key)))
			pt, err := a.Open(nil, nonce, r.Take(len(box)-r.Offset), ad)
			if err != nil {
				panic(e.Wrap(e.InvalidData, "Unable to decrypt box", err))
			}
			return pt
		})
		if err != nil {
			panic(e.Wrap(e.InvalidData, "Unable to decrypt box", err))
		}
		return v
	})
}
