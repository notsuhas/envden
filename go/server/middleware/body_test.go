package middleware

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"

	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
)

func expectCode(t *testing.T, code enverrors.Code, fn func() error) {
	t.Helper()
	if err := fn(); !enverrors.Is(err, code) {
		t.Fatalf("got %v want %s", err, code)
	}
}

func TestBodyLimits(t *testing.T) {
	for _, path := range []string{"/v1/opaque/login/start", "/v1/pairing/mailboxes", "/v1/vault"} {
		r := httptest.NewRequest("POST", path, bytes.NewReader(make([]byte, 65537)))
		expectCode(t, enverrors.InvalidInput, func() error { _, err := ReadBody(r, routeLimit(t, r), nil); return err })
	}
	for _, length := range []string{"65537", "-1", "1.5", "9007199254740992", "abc"} {
		r := httptest.NewRequest("POST", "/v1/opaque/login/start", bytes.NewReader([]byte("small")))
		r.Header.Set("Content-Length", length)
		expectCode(t, enverrors.InvalidInput, func() error { _, err := ReadBody(r, 65536, nil); return err })
	}
	r := httptest.NewRequest("PUT", "/v1/blobs/hash", bytes.NewReader(make([]byte, 65537)))
	body, err := ReadBody(r, routeLimit(t, r), nil)
	if err != nil || len(body) != 65537 {
		t.Fatal("blob cap")
	}
	r = httptest.NewRequest("POST", "/v1/swap", bytes.NewReader([]byte("abc")))
	r.Header.Set("Content-Length", "1")
	expectCode(t, enverrors.InvalidInput, func() error { _, err := ReadBody(r, 65536, nil); return err })
	r = httptest.NewRequest("POST", "/v1/swap", bytes.NewReader([]byte("abc")))
	expectCode(t, enverrors.Unauthorized, func() error { _, err := ReadBody(r, 65536, crypto.SHA256(nil)); return err })
	for _, row := range []struct {
		method, path string
		code         enverrors.Code
	}{{"POST", "/v1/files/vault", enverrors.NotFound}, {"GET", "/v1/head", enverrors.InvalidInput}, {"GET", "/v1/hello", enverrors.InvalidInput}} {
		r = httptest.NewRequest(row.method, row.path, nil)
		r.Header.Set("Content-Length", "1")
		expectCode(t, row.code, func() error { _, err := RequestRoute(r); return err })
	}
}

func TestBudgets(t *testing.T) {
	budget := NewBodyBudget()
	id := func(n byte) []byte { return bytes.Repeat([]byte{n}, 32) }
	release, err := budget.Reserve(67108864, "member", id(1), id(1))
	if err != nil {
		t.Fatal(err)
	}
	expectCode(t, enverrors.Busy, func() error { _, err := budget.Reserve(1, "member", id(1), id(1)); return err })
	second, err := budget.Reserve(33554432, "member", id(1), id(2))
	if err != nil {
		t.Fatal(err)
	}
	expectCode(t, enverrors.Busy, func() error { _, err := budget.Reserve(1, "member", id(1), id(3)); return err })
	other, err := budget.Reserve(33554432, "member", id(2), id(1))
	if err != nil {
		t.Fatal(err)
	}
	other()
	second()
	second()
	release()
	release()
	release, err = budget.Reserve(67108864, "member", id(1), id(1))
	if err != nil {
		t.Fatal(err)
	}
	release()
	for range 8 {
		if _, err := budget.Reserve(1, "public", nil, nil); err != nil {
			t.Fatal(err)
		}
	}
	expectCode(t, enverrors.Busy, func() error { _, err := budget.Reserve(1, "public", nil, nil); return err })
	release, err = budget.Reserve(1, "authorized", nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	release()
	if Match(http.MethodPost, "/v1/pairing/mailboxes").Policy != "" || Match("PUT", "/v1/pairing/mailboxes/1/KE1").Policy != "mailbox" || Match("DELETE", "/v1/pairing/mailboxes/1/KE1") != nil {
		t.Fatal("closed route policy")
	}
}

func routeLimit(t *testing.T, r *http.Request) int64 {
	t.Helper()
	route, err := RequestRoute(r)
	if err != nil {
		t.Fatal(err)
	}

	return route.Limit
}
