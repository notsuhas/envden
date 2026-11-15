package epochs

import (
	"crypto/ecdh"
	"crypto/hpke"

	e "github.com/notsuhas/envden/go/core/errors"
	d "github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func KeyCommit(key, vaultID []byte, epoch int) ([]byte, error) {
	return b.Try(func() []byte {
		return c.MAC(b.B32.Write(key), "epoch-commit", b.Concat(b.B32.Write(vaultID), b.U32.Write(epoch)))
	})
}

func wrapInfo(vaultID []byte, epoch int, recipient, encPub []byte) []byte {
	return b.Concat(b.Ctx("wrap"), b.B32.Write(vaultID), b.U32.Write(epoch), b.B16.Write(recipient), b.B32.Write(encPub))
}

func SealWrap(key, vaultID []byte, epoch int, recipient, encPub []byte) (d.Wrap, error) {
	v, err := b.Try(func() d.Wrap {
		pk, err := hpke.DHKEM(ecdh.X25519()).NewPublicKey(encPub)
		if err != nil {
			panic(e.Wrap(e.InvalidData, "Unable to encrypt wrap", err))
		}
		enc, s, err := hpke.NewSender(pk, hpke.HKDFSHA256(), hpke.ChaCha20Poly1305(), wrapInfo(vaultID, epoch, recipient, encPub))
		if err != nil {
			panic(e.Wrap(e.InvalidData, "Unable to encrypt wrap", err))
		}
		ct, err := s.Seal(nil, b.B32.Write(key))
		if err != nil {
			panic(e.Wrap(e.InvalidData, "Unable to encrypt wrap", err))
		}
		return d.Wrap{Recipient: recipient, Enc: enc, Ct: ct}
	})
	if err != nil {
		return v, e.Wrap(e.InvalidData, "Unable to encrypt wrap", err)
	}
	return v, nil
}

func OpenWrap(w d.Wrap, encSk, encPub, vaultID []byte, epoch int, commit []byte) ([]byte, error) {
	key, err := b.Try(func() []byte {
		sk, err := hpke.DHKEM(ecdh.X25519()).NewPrivateKey(b.B32.Write(encSk))
		if err != nil {
			panic(e.Wrap(e.InvalidData, "Unable to decrypt wrap", err))
		}
		pt, err := hpke.Open(sk, hpke.HKDFSHA256(), hpke.ChaCha20Poly1305(), wrapInfo(vaultID, epoch, w.Recipient, encPub), b.Concat(w.Enc, w.Ct))
		if err != nil {
			panic(e.Wrap(e.InvalidData, "Unable to decrypt wrap", err))
		}
		return pt
	})
	if err != nil {
		return nil, e.Wrap(e.InvalidData, "Unable to decrypt wrap", err)
	}
	return b.Try(func() []byte {
		b.RequireValue(b.Equal(b.Must(KeyCommit(key, vaultID, epoch)), commit), "Epoch commit mismatch")

		return key
	})
}
