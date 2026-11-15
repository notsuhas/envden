package server

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/internal/validation"
	"github.com/notsuhas/envden/go/core/protocol/versions"
	"golang.org/x/text/cases"
	"golang.org/x/text/language"
)

type ServerHello struct {
	Challenge     []byte
	Host          string
	ServerSignPub []byte
	AppVersion    string
	MinClient     string
	Protocols     []int
}

var ServerHelloCodec = encoding.NewCodec(func(r *encoding.Reader) ServerHello {
	encoding.Tagged(10, r)

	return ServerHello{
		Challenge:     encoding.B32.Read(r),
		Host:          encoding.Str.Read(r),
		ServerSignPub: encoding.B32.Read(r),
		AppVersion:    encoding.Str.Read(r),
		MinClient:     encoding.Str.Read(r),
		Protocols:     encoding.List(encoding.U8, func(a, c int) int { return a - c }).Read(r),
	}
}, func(v ServerHello) []byte {
	return encoding.Concat(
		encoding.Header(10),
		encoding.B32.Write(v.Challenge),
		encoding.Str.Write(v.Host),
		encoding.B32.Write(v.ServerSignPub),
		encoding.Str.Write(v.AppVersion),
		encoding.Str.Write(v.MinClient),
		encoding.List(encoding.U8, func(a, c int) int { return a - c }).Write(v.Protocols),
	)
}, func(v ServerHello) {
	validation.EdPublic(v.ServerSignPub)
	encoding.Must(versions.ParseSemver(v.AppVersion))
	encoding.Must(versions.ParseSemver(v.MinClient))
	encoding.RequireValue(v.Host == cases.Lower(language.Und).String(v.Host))
})
