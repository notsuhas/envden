package shared

import (
	"errors"

	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
)

func Check(ok bool) error {
	if !ok {
		return enverrors.New(enverrors.InvalidData, "Invalid chain data")
	}

	return nil
}

func ID(v []byte) string { return encoding.Base32(v) }

func Invalid(err error) bool {
	x := &enverrors.Error{}
	ok := errors.As(err, &x)

	return ok && x.Code == enverrors.InvalidData
}

// Codec callbacks may panic; ordinary chain validation returns errors.
func TryResult[T any](fn func() (T, error)) (value T, err error) {
	defer func() {
		if cause := recover(); cause != nil {
			if failure, ok := cause.(error); ok {
				err = failure
			} else {
				panic(cause)
			}
		}
	}()

	return fn()
}
