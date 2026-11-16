package client

import (
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestErrorKindExactCase(t *testing.T) {
	r := response(409, `{"KIND":"head-moved"}`)
	defer func() { _ = r.Body.Close() }()
	if e := ResponseError(r, "/v1/head"); !errors.Is(e, errors.InvalidData) {
		t.Fatal(e)
	}
}
