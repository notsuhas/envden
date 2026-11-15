package epochs

import (
	"crypto/ecdh"
	"crypto/hpke"

	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func KeyCommit(key, vaultID []byte, epoch int) ([]byte, error) {
	return encoding.Try(func() []byte {
		return crypto.MAC(encoding.B32.Write(key), "epoch-commit", encoding.Concat(encoding.B32.Write(vaultID), encoding.U32.Write(epoch)))
	})
}

func wrapInfo(vaultID []byte, epoch int, recipient, encPub []byte) []byte {
	return encoding.Concat(encoding.Ctx("wrap"), encoding.B32.Write(vaultID), encoding.U32.Write(epoch), encoding.B16.Write(recipient), encoding.B32.Write(encPub))
}

func SealWrap(key, vaultID []byte, epoch int, recipient, encPub []byte) (epochs.Wrap, error) {
	v, err := encoding.Try(func() epochs.Wrap {
		pk, err := hpke.DHKEM(ecdh.X25519()).NewPublicKey(encPub)
		if err != nil {
			panic(enverrors.Wrap(enverrors.InvalidData, "Unable to encrypt wrap", err))
		}
		enc, s, err := hpke.NewSender(pk, hpke.HKDFSHA256(), hpke.ChaCha20Poly1305(), wrapInfo(vaultID, epoch, recipient, encPub))
		if err != nil {
			panic(enverrors.Wrap(enverrors.InvalidData, "Unable to encrypt wrap", err))
		}
		ct, err := s.Seal(nil, encoding.B32.Write(key))
		if err != nil {
			panic(enverrors.Wrap(enverrors.InvalidData, "Unable to encrypt wrap", err))
		}

		return epochs.Wrap{Recipient: recipient, Enc: enc, Ct: ct}
	})
	if err != nil {
		return v, enverrors.Wrap(enverrors.InvalidData, "Unable to encrypt wrap", err)
	}

	return v, nil
}

func OpenWrap(w epochs.Wrap, encSk, encPub, vaultID []byte, epoch int, commit []byte) ([]byte, error) {
	key, err := encoding.Try(func() []byte {
		sk, err := hpke.DHKEM(ecdh.X25519()).NewPrivateKey(encoding.B32.Write(encSk))
		if err != nil {
			panic(enverrors.Wrap(enverrors.InvalidData, "Unable to decrypt wrap", err))
		}
		pt, err := hpke.Open(sk, hpke.HKDFSHA256(), hpke.ChaCha20Poly1305(), wrapInfo(vaultID, epoch, w.Recipient, encPub), encoding.Concat(w.Enc, w.Ct))
		if err != nil {
			panic(enverrors.Wrap(enverrors.InvalidData, "Unable to decrypt wrap", err))
		}

		return pt
	})
	if err != nil {
		return nil, enverrors.Wrap(enverrors.InvalidData, "Unable to decrypt wrap", err)
	}

	return encoding.Try(func() []byte {
		encoding.RequireValue(encoding.Equal(encoding.Must(KeyCommit(key, vaultID, epoch)), commit), "Epoch commit mismatch")

		return key
	})
}
