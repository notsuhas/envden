package middleware

import (
	e "github.com/notsuhas/envden/go/core/errors"
	x "github.com/notsuhas/envden/go/server/shared"
	"net/http"
	"regexp"
	"strconv"
)

const MaxRequestBodySize = 33554432

var digits = regexp.MustCompile("^[0-9]+$")

func DeclaredBodySize(r *http.Request, limit int64) int64 {
	length, exists := r.Header["Content-Length"]
	if !exists {
		return limit
	}
	value := ""
	if len(length) > 0 {
		value = length[0]
	}
	n, err := strconv.ParseUint(value, 10, 64)
	if !digits.MatchString(value) || err != nil || n > 9007199254740991 || n > uint64(limit) {
		x.Fail(e.InvalidInput, "Request too large")
	}
	return int64(n)
}
func ReadBody(r *http.Request, limit int64, hash []byte) []byte {
	return ReadBodyTimed(r, limit, hash, BodyTiming{})
}
