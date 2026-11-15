package crypto

import (
	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"golang.org/x/crypto/chacha20poly1305"
)

func SealBox(key, plaintext, ad []byte, rng ...Random) ([]byte, error) {
	return encoding.Try(func() []byte {
		nonce := RNG(rng)(24)
		encoding.RequireValue(len(nonce) == 24)
		a := encoding.Must(chacha20poly1305.NewX(encoding.B32.Write(key)))

		return encoding.Concat([]byte{1}, nonce, a.Seal(nil, nonce, plaintext, ad))
	})
}

func OpenBox(key, box, ad []byte) ([]byte, error) {
	return encoding.Try(func() []byte {
		r := &encoding.Reader{Data: box}
		encoding.RequireValue(r.Take(1)[0] == 1, "Unknown blob version")
		nonce := r.Take(24)
		v, err := encoding.Try(func() []byte {
			a := encoding.Must(chacha20poly1305.NewX(encoding.B32.Write(key)))
			pt, err := a.Open(nil, nonce, r.Take(len(box)-r.Offset), ad)
			if err != nil {
				panic(enverrors.Wrap(enverrors.InvalidData, "Unable to decrypt box", err))
			}

			return pt
		})
		if err != nil {
			panic(enverrors.Wrap(enverrors.InvalidData, "Unable to decrypt box", err))
		}

		return v
	})
}
