package requests

import (
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/versions"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

func BuildHello(body wire.ServerHello, sk []byte) (encoding.Signed[wire.ServerHello], error) {
	return crypto.SignObject(wire.ServerHelloCodec, body, sk, "server-hello")
}

func VerifyHello(v encoding.Signed[wire.ServerHello], challenge []byte, host string, pin []byte, minServer string) crypto.Verification[wire.ServerHello] {
	r, err := encoding.Try(func() crypto.Verification[wire.ServerHello] {
		x := v.Body
		if !encoding.Equal(x.Challenge, challenge) || x.Host != cases.Lower(language.Und).String(host) || !encoding.Equal(encoding.Must(keys.ServerPin(x.ServerSignPub)), pin) || encoding.Must(versions.CompareSemver(x.AppVersion, minServer)) < 0 {
			return crypto.Verification[wire.ServerHello]{Reason: "Hello binding or version mismatch"}
		}

		return encoding.Must(crypto.VerifyObject(wire.ServerHelloCodec, v, x.ServerSignPub, "server-hello"))
	})
	if err != nil {
		return crypto.Verification[wire.ServerHello]{Reason: "Invalid hello"}
	}

	return r
}
