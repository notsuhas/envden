package server

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/core/query"
)

func TestRequestHostUsesHostHeader(t *testing.T) {
	r := httptest.NewRequest("GET", "http://other/v1/hello", nil)
	r.Host = "[::1]:80"
	if h := requestHost(r); h != "[::1]" {
		t.Fatal(h)
	}
}
func TestLiteralBackslashPath(t *testing.T) {
	r := httptest.NewRequest("GET", `http://localhost/v1\head`, nil)
	normalizeRequestURL(r)
	if r.URL.EscapedPath() != "/v1/head" {
		t.Fatal(r.URL)
	}
}
func TestMailboxNumber(t *testing.T) {
	for _, r := range []struct {
		s string
		n int
	}{{"1e1", 10}, {" 7", 7}, {"0x7", 7}, {"1.5", -1}, {"NaN", -1}} {
		if got := mailboxNumber(r.s); got != r.n {
			t.Fatal(r, got)
		}
	}
}
func TestMalformedRangeNotDropped(t *testing.T) {
	if _, err := parseSequence(query.Values("from=%ZZ").Get("from")); err == nil {
		t.Fatal("invalid range accepted")
	}
}

func TestEncodedBackslashStaysEncoded(t *testing.T) {
	r := httptest.NewRequest("GET", "http://localhost/v1%5Chead", nil)
	normalizeRequestURL(r)
	if r.URL.EscapedPath() != "/v1%5Chead" {
		t.Fatal(r.URL)
	}
}

func TestContinueBeforeRouting(t *testing.T) {
	app, err := CreateApp(Options{Now: func() int64 { return 0 }, Config: Config{AppVersion: "0.3.8", MinClient: "0.0.0"}})
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(app)
	defer server.Close()
	response, _ := rawResponse(t, strings.TrimPrefix(server.URL, "http://"), "POST /missing HTTP/1.1\r\nHost: x\r\nExpect: 100-continue\r\nContent-Length: 1\r\nConnection: close\r\n\r\n")
	if response.StatusCode != 100 {
		t.Fatal(response.StatusCode)
	}
}

func TestNormalizedQueryPreservesAuthority(t *testing.T) {
	for _, row := range []struct{ raw, want string }{
		{"/a/../v1/head?", "/v1/head"},
		{"/v1/head?q='", "/v1/head?q=%27"},
		{"/v1/head?z=%2f&x=a+b&z=%27", "/v1/head?z=%2f&x=a+b&z=%27"},
	} {
		r := httptest.NewRequest("GET", "http://original.example:1234"+row.raw, nil)
		normalizeRequestURL(r)
		if got := r.URL.RequestURI(); got != row.want {
			t.Errorf("%s: got %s, want %s", row.raw, got, row.want)
		}
		if r.URL.Host != "original.example:1234" || r.Host != "original.example:1234" {
			t.Fatal("authority changed", r.URL, r.Host)
		}
	}
}
