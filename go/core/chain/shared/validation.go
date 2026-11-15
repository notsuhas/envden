package shared

import (
	e "github.com/notsuhas/envden/go/core/errors"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
)

func Check(ok bool) {
	if !ok {
		panic(e.New(e.InvalidData, "Invalid chain data"))
	}
}

func ID(v []byte) string { return b.Base32(v) }

func Invalid(err error) bool { x, ok := err.(*e.Error); return ok && x.Code == e.InvalidData }

func Try[T any](fn func() T) (value T, err error) {
	defer func() {
		if p := recover(); p != nil {
			if e, ok := p.(error); ok {
				err = e
			} else {
				panic(p)
			}
		}
	}()

	return fn(), nil
}
