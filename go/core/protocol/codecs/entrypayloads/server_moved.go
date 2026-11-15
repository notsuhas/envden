package entrypayloads

import (
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

type ServerMoved struct {
	OldPin     []byte
	NewPin     []byte
	NewAddress string
}

var ServerMovedCodec = encoding.NewCodec(func(r *encoding.Reader) ServerMoved {
	return ServerMoved{OldPin: encoding.B32.Read(r), NewPin: encoding.B32.Read(r), NewAddress: encoding.Str.Read(r)}
}, func(v ServerMoved) []byte {
	return encoding.Concat(encoding.B32.Write(v.OldPin), encoding.B32.Write(v.NewPin), encoding.Str.Write(v.NewAddress))
}, nil)
