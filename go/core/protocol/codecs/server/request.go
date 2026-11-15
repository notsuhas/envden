package server

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	versions "github.com/notsuhas/envden/go/core/protocol/versions"
)

type Request struct {
	ServerPin     []byte
	VaultId       []byte
	Method        string
	PathAndQuery  string
	BodyHash      []byte
	Time          uint64
	Nonce         []byte
	Device        []byte
	ClientVersion string
}

var RequestCodec = b.NewCodec(func(r *b.Reader) Request {
	b.Tagged(9, r)

	return Request{
		ServerPin:     b.B32.Read(r),
		VaultId:       b.B32.Read(r),
		Method:        b.Str.Read(r),
		PathAndQuery:  b.Str.Read(r),
		BodyHash:      b.B32.Read(r),
		Time:          b.U64.Read(r),
		Nonce:         b.B16.Read(r),
		Device:        b.B16.Read(r),
		ClientVersion: b.Str.Read(r),
	}
}, func(v Request) []byte {
	return b.Concat(
		b.Header(9),
		b.B32.Write(v.ServerPin),
		b.B32.Write(v.VaultId),
		b.Str.Write(v.Method),
		b.Str.Write(v.PathAndQuery),
		b.B32.Write(v.BodyHash),
		b.U64.Write(v.Time),
		b.B16.Write(v.Nonce),
		b.B16.Write(v.Device),
		b.Str.Write(v.ClientVersion),
	)
}, func(v Request) { b.Must(versions.ParseSemver(v.ClientVersion)) })
