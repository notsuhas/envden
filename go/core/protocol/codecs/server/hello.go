package server

import (
	"golang.org/x/text/cases"
	"golang.org/x/text/language"

	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	validation "github.com/notsuhas/envden/go/core/protocol/internal/validation"
	versions "github.com/notsuhas/envden/go/core/protocol/versions"
)

type ServerHello struct {
	Challenge     []byte
	Host          string
	ServerSignPub []byte
	AppVersion    string
	MinClient     string
	Protocols     []int
}

var ServerHelloCodec = b.NewCodec(func(r *b.Reader) ServerHello {
	b.Tagged(10, r)

	return ServerHello{
		Challenge:     b.B32.Read(r),
		Host:          b.Str.Read(r),
		ServerSignPub: b.B32.Read(r),
		AppVersion:    b.Str.Read(r),
		MinClient:     b.Str.Read(r),
		Protocols:     b.List(b.U8, func(a, c int) int { return a - c }).Read(r),
	}
}, func(v ServerHello) []byte {
	return b.Concat(
		b.Header(10),
		b.B32.Write(v.Challenge),
		b.Str.Write(v.Host),
		b.B32.Write(v.ServerSignPub),
		b.Str.Write(v.AppVersion),
		b.Str.Write(v.MinClient),
		b.List(b.U8, func(a, c int) int { return a - c }).Write(v.Protocols),
	)
}, func(v ServerHello) {
	validation.EdPublic(v.ServerSignPub)
	b.Must(versions.ParseSemver(v.AppVersion))
	b.Must(versions.ParseSemver(v.MinClient))
	b.RequireValue(v.Host == cases.Lower(language.Und).String(v.Host))
})
