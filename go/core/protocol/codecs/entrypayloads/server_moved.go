package entrypayloads

import (
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

type ServerMoved struct {
	OldPin     []byte
	NewPin     []byte
	NewAddress string
}

var ServerMovedCodec = b.NewCodec(func(r *b.Reader) ServerMoved {
	return ServerMoved{OldPin: b.B32.Read(r), NewPin: b.B32.Read(r), NewAddress: b.Str.Read(r)}
}, func(v ServerMoved) []byte {
	return b.Concat(b.B32.Write(v.OldPin), b.B32.Write(v.NewPin), b.Str.Write(v.NewAddress))
}, nil)
