package middleware

import (
	"net/http"
	"regexp"
	"strconv"

	enverrors "github.com/notsuhas/envden/go/core/errors"
)

const MaxRequestBodySize = 33554432

var digits = regexp.MustCompile("^[0-9]+$")

func DeclaredBodySize(r *http.Request, limit int64) (int64, error) {
	length, exists := r.Header["Content-Length"]
	if !exists {
		return limit, nil
	}
	value := ""
	if len(length) > 0 {
		value = length[0]
	}
	n, err := strconv.ParseUint(value, 10, 64)
	//nolint:gosec // G115: route body limits are nonnegative constants.
	if !digits.MatchString(value) || err != nil || n > 9007199254740991 || n > uint64(limit) {
		return 0, enverrors.New(enverrors.InvalidInput, "Request too large")
	}

	return int64(n), nil
}

func ReadBody(r *http.Request, limit int64, hash []byte) ([]byte, error) {
	return ReadBodyTimed(r, limit, hash, BodyTiming{})
}
