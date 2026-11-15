package proofs

import (
	"strings"

	enverrors "github.com/notsuhas/envden/go/core/errors"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func kindByte(kind string) byte {
	if kind == "setup" {
		return 1
	}

	return 2
}

func tokenBytes(text string) ([]byte, error) {
	return encoding.Unbase32(strings.Map(func(r rune) rune {
		if jsSpace(r) {
			return -1
		}

		return r
	}, text))
}

func EncodeToken(kind string, secret, pin []byte) (string, error) {
	return encoding.Try(func() string {
		encoding.RequireValue(len(secret) == 20)

		return encoding.Base32(encoding.Concat([]byte{kindByte(kind)}, secret, encoding.B32.Write(pin)))
	})
}

func IsToken(kind, text string) bool {
	v, err := tokenBytes(text)

	return err == nil && len(v) == 53 && v[0] == kindByte(kind)
}

type Token struct{ Secret, ServerPin []byte }

func DecodeToken(kind, text string) (Token, error) {
	if !IsToken(kind, text) {
		return Token{}, enverrors.New(enverrors.InvalidInput, "That isn't a "+kind+" token. Copy the whole token.")
	}
	v, _ := tokenBytes(text)

	return Token{v[1:21], v[21:]}, nil
}

func TokenKey(kind string, secret []byte) ([]byte, error) {
	return encoding.Try(func() []byte {
		encoding.RequireValue(len(secret) == 20)

		return crypto.H(kind+"-token", secret)
	})
}

func TokenProof(kind string, key []byte, request wire.Request) ([]byte, error) {
	return encoding.Try(func() []byte {
		label := "repair-proof"
		if kind == "setup" {
			label = "token-proof"
		}

		return crypto.MAC(encoding.B32.Write(key), label, wire.RequestCodec.Write(request))
	})
}

func VerifyTokenProof(kind string, key []byte, request wire.Request, proof []byte) (crypto.Verification[bool], error) {
	expected, err := TokenProof(kind, key, request)
	if err != nil {
		return crypto.Verification[bool]{}, err
	}
	if !encoding.Equal(proof, expected) {
		return crypto.Verification[bool]{Reason: "Invalid token proof"}, nil
	}

	return crypto.Verification[bool]{OK: true, Value: true}, nil
}

func jsSpace(r rune) bool {
	return r >= 9 && r <= 13 || r == 32 || r == 160 || r == 5760 || r >= 8192 && r <= 8202 || r == 8232 || r == 8233 || r == 8239 || r == 8287 || r == 12288 || r == 65279
}
