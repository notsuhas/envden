package opaque

import (
	"encoding/base64"
	"regexp"

	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

var OPAQUELengths = map[string]int{"serverSetup": 128, "clientRegistrationState": 64, "registrationRequest": 32, "registrationResponse": 64, "registrationRecord": 192, "exportKey": 64, "serverStaticPublicKey": 32, "clientLoginState": 192, "startLoginRequest": 96, "serverLoginState": 128, "loginResponse": 320, "finishLoginRequest": 64, "sessionKey": 64}

var messageChars = regexp.MustCompile(`^[A-Za-z0-9_-]+$`)

func OpaqueMessage(value string, length int) (string, error) {
	return encoding.Try(func() string {
		encoding.RequireValue(messageChars.MatchString(value), "Invalid OPAQUE encoding")
		v, err := base64.RawURLEncoding.DecodeString(value)
		encoding.RequireValue(err == nil && len(v) == length && base64.RawURLEncoding.EncodeToString(v) == value, "Invalid OPAQUE length or encoding")

		return value
	})
}

func check(value, key string) []byte {
	encoding.Must(OpaqueMessage(value, OPAQUELengths[key]))
	v, _ := base64.RawURLEncoding.DecodeString(value)

	return v
}

func text(v []byte) string { return base64.RawURLEncoding.EncodeToString(v) }

func attempt[T any](f func() T) (out T, err error) {
	defer func() {
		if p := recover(); p != nil {
			if x, ok := p.(error); ok {
				err = x
			} else {
				panic(p)
			}
		}
	}()

	return f(), nil
}
