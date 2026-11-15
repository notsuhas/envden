package requests

import (
	"golang.org/x/text/cases"
	"golang.org/x/text/language"

	s "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/versions"
)

func BuildHello(body s.ServerHello, sk []byte) (b.Signed[s.ServerHello], error) {
	return c.SignObject(s.ServerHelloCodec, body, sk, "server-hello")
}

func VerifyHello(v b.Signed[s.ServerHello], challenge []byte, host string, pin []byte, minServer string) c.Verification[s.ServerHello] {
	r, err := b.Try(func() c.Verification[s.ServerHello] {
		x := v.Body
		if !b.Equal(x.Challenge, challenge) || x.Host != cases.Lower(language.Und).String(host) || !b.Equal(b.Must(keys.ServerPin(x.ServerSignPub)), pin) || b.Must(versions.CompareSemver(x.AppVersion, minServer)) < 0 {
			return c.Verification[s.ServerHello]{Reason: "Hello binding or version mismatch"}
		}
		return b.Must(c.VerifyObject(s.ServerHelloCodec, v, x.ServerSignPub, "server-hello"))
	})
	if err != nil {
		return c.Verification[s.ServerHello]{Reason: "Invalid hello"}
	}
	return r
}
