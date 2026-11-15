package middleware

import (
	"bytes"
	e "github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	"net/http"
	"net/http/httptest"
	"testing"
)

func expectCode(t *testing.T, code e.Code, fn func()) {
	t.Helper()
	defer func() {
		v := recover()
		err, ok := v.(error)
		if !ok || !e.Is(err, code) {
			t.Fatalf("got %v want %s", v, code)
		}
	}()
	fn()
	t.Fatal("expected error")
}
func TestBodyLimits(t *testing.T) {
	for _, path := range []string{"/v1/opaque/login/start", "/v1/pairing/mailboxes", "/v1/vault"} {
		r := httptest.NewRequest("POST", path, bytes.NewReader(make([]byte, 65537)))
		expectCode(t, e.InvalidInput, func() { ReadBody(r, RequestRoute(r).Limit, nil) })
	}
	for _, length := range []string{"65537", "-1", "1.5", "9007199254740992", "abc"} {
		r := httptest.NewRequest("POST", "/v1/opaque/login/start", bytes.NewReader([]byte("small")))
		r.Header.Set("Content-Length", length)
		expectCode(t, e.InvalidInput, func() { ReadBody(r, 65536, nil) })
	}
	r := httptest.NewRequest("PUT", "/v1/blobs/hash", bytes.NewReader(make([]byte, 65537)))
	if len(ReadBody(r, RequestRoute(r).Limit, nil)) != 65537 {
		t.Fatal("blob cap")
	}
	r = httptest.NewRequest("POST", "/v1/swap", bytes.NewReader([]byte("abc")))
	r.Header.Set("Content-Length", "1")
	expectCode(t, e.InvalidInput, func() { ReadBody(r, 65536, nil) })
	r = httptest.NewRequest("POST", "/v1/swap", bytes.NewReader([]byte("abc")))
	expectCode(t, e.Unauthorized, func() { ReadBody(r, 65536, c.SHA256(nil)) })
	for _, row := range []struct {
		method, path string
		code         e.Code
	}{{"POST", "/v1/files/vault", e.NotFound}, {"GET", "/v1/head", e.InvalidInput}, {"GET", "/v1/hello", e.InvalidInput}} {
		r = httptest.NewRequest(row.method, row.path, nil)
		r.Header.Set("Content-Length", "1")
		expectCode(t, row.code, func() { RequestRoute(r) })
	}
}
func TestBudgets(t *testing.T) {
	budget := NewBodyBudget()
	id := func(n byte) []byte { return bytes.Repeat([]byte{n}, 32) }
	release := budget.Reserve(67108864, "member", id(1), id(1))
	expectCode(t, e.Busy, func() { budget.Reserve(1, "member", id(1), id(1)) })
	second := budget.Reserve(33554432, "member", id(1), id(2))
	expectCode(t, e.Busy, func() { budget.Reserve(1, "member", id(1), id(3)) })
	other := budget.Reserve(33554432, "member", id(2), id(1))
	other()
	second()
	second()
	release()
	release()
	budget.Reserve(67108864, "member", id(1), id(1))()
	for range 8 {
		budget.Reserve(1, "public", nil, nil)
	}
	expectCode(t, e.Busy, func() { budget.Reserve(1, "public", nil, nil) })
	budget.Reserve(1, "authorized", nil, nil)()
	if Match(http.MethodPost, "/v1/pairing/mailboxes").Policy != "" || Match("PUT", "/v1/pairing/mailboxes/1/KE1").Policy != "mailbox" || Match("DELETE", "/v1/pairing/mailboxes/1/KE1") != nil {
		t.Fatal("closed route policy")
	}
}
