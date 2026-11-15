package proofs

import (
	"strings"

	e "github.com/notsuhas/envden/go/core/errors"
	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func kindByte(kind string) byte {
	if kind == "setup" {
		return 1
	}
	return 2
}

func tokenBytes(text string) ([]byte, error) {
	return b.Unbase32(strings.Map(func(r rune) rune {
		if jsSpace(r) {
			return -1
		}
		return r
	}, text))
}

func EncodeToken(kind string, secret, pin []byte) (string, error) {
	return b.Try(func() string {
		b.RequireValue(len(secret) == 20)

		return b.Base32(b.Concat([]byte{kindByte(kind)}, secret, b.B32.Write(pin)))
	})
}

func IsToken(kind, text string) bool {
	v, err := tokenBytes(text)

	return err == nil && len(v) == 53 && v[0] == kindByte(kind)
}

type Token struct{ Secret, ServerPin []byte }

func DecodeToken(kind, text string) (Token, error) {
	if !IsToken(kind, text) {
		return Token{}, e.New(e.InvalidInput, "That isn't a "+kind+" token. Copy the whole token.")
	}
	v, _ := tokenBytes(text)

	return Token{v[1:21], v[21:]}, nil
}

func TokenKey(kind string, secret []byte) ([]byte, error) {
	return b.Try(func() []byte {
		b.RequireValue(len(secret) == 20)

		return c.H(kind+"-token", secret)
	})
}

func TokenProof(kind string, key []byte, request s.Request) ([]byte, error) {
	return b.Try(func() []byte {
		label := "repair-proof"
		if kind == "setup" {
			label = "token-proof"
		}
		return c.MAC(b.B32.Write(key), label, s.RequestCodec.Write(request))
	})
}

func VerifyTokenProof(kind string, key []byte, request s.Request, proof []byte) (c.Verification[bool], error) {
	expected, err := TokenProof(kind, key, request)
	if err != nil {
		return c.Verification[bool]{}, err
	}
	if !b.Equal(proof, expected) {
		return c.Verification[bool]{Reason: "Invalid token proof"}, nil
	}
	return c.Verification[bool]{OK: true, Value: true}, nil
}

func jsSpace(r rune) bool {
	return r >= 9 && r <= 13 || r == 32 || r == 160 || r == 5760 || r >= 8192 && r <= 8202 || r == 8232 || r == 8233 || r == 8239 || r == 8287 || r == 12288 || r == 65279
}
