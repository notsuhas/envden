package crypto

import (
	"crypto/hkdf"
	"crypto/hmac"
	"crypto/sha256"

	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func Frame(label string, message []byte) []byte {
	return encoding.Concat(encoding.Ctx(label), encoding.U64.Write(uint64(len(message))), message)
}

func SHA256(message []byte) []byte {
	s := sha256.Sum256(message)

	return s[:]
}

func H(label string, message []byte) []byte { return SHA256(Frame(label, message)) }

func MAC(key []byte, label string, message []byte) []byte {
	h := hmac.New(sha256.New, key)
	h.Write(Frame(label, message))

	return h.Sum(nil)
}

func KDF(ikm, salt []byte, label string, extra ...[]byte) []byte {
	return encoding.Must(hkdf.Key(sha256.New, ikm, salt, string(encoding.Concat(append([][]byte{encoding.Ctx(label)}, extra...)...)), 32))
}
