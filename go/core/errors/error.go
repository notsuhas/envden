// Package errors holds EnvdenError: fixed text, a Code, and the underlying cause.
package errors

import stderrors "errors"

// Error mirrors the TS EnvdenError. Message is fixed text; never put secrets in it.
type Error struct {
	Code    Code
	Message string
	Cause   error
}

func (e *Error) Error() string { return e.Message }

func (e *Error) Unwrap() error { return e.Cause }

// New returns an Error with no cause.
func New(code Code, message string) *Error {
	return &Error{Code: code, Message: message}
}

// Wrap returns an Error carrying cause.
func Wrap(code Code, message string, cause error) *Error {
	return &Error{Code: code, Message: message, Cause: cause}
}

// As returns the first *Error in err's chain, matching TS isEnvdenError on the thrown value.
func As(err error) (*Error, bool) {
	var target *Error
	if stderrors.As(err, &target) {
		return target, true
	}

	return nil, false
}

// Is reports whether err is an *Error with code.
func Is(err error, code Code) bool {
	target, ok := As(err)

	return ok && target.Code == code
}
