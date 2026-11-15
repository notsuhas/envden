package server

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/versions"
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

var RequestCodec = encoding.NewCodec(func(r *encoding.Reader) Request {
	encoding.Tagged(9, r)

	return Request{
		ServerPin:     encoding.B32.Read(r),
		VaultId:       encoding.B32.Read(r),
		Method:        encoding.Str.Read(r),
		PathAndQuery:  encoding.Str.Read(r),
		BodyHash:      encoding.B32.Read(r),
		Time:          encoding.U64.Read(r),
		Nonce:         encoding.B16.Read(r),
		Device:        encoding.B16.Read(r),
		ClientVersion: encoding.Str.Read(r),
	}
}, func(v Request) []byte {
	return encoding.Concat(
		encoding.Header(9),
		encoding.B32.Write(v.ServerPin),
		encoding.B32.Write(v.VaultId),
		encoding.Str.Write(v.Method),
		encoding.Str.Write(v.PathAndQuery),
		encoding.B32.Write(v.BodyHash),
		encoding.U64.Write(v.Time),
		encoding.B16.Write(v.Nonce),
		encoding.B16.Write(v.Device),
		encoding.Str.Write(v.ClientVersion),
	)
}, func(v Request) { encoding.Must(versions.ParseSemver(v.ClientVersion)) })
