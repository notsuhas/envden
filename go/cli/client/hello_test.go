package client

import (
	"context"
	"github.com/notsuhas/envden/go/core/errors"
	"net/http"
	"testing"
)

func TestHelloBeforeMemberRequests(t *testing.T) {
	o, greeting := fixture(t)
	o.Pin = make([]byte, 32)
	signed := 0
	o.Fetcher = func(req *http.Request) (*http.Response, error) {
		if welcome := greeting(req); welcome != nil {
			return welcome, nil
		}
		signed++
		return response(200, `{}`), nil
	}
	if _, e := CreateClient(o).Request(context.Background(), "/v1/head", "GET", nil); !errors.Is(e, errors.Unauthorized) {
		t.Fatal(e)
	}
	if signed != 0 {
		t.Fatal("identity sent before pin check")
	}
	for _, raw := range []string{`{"hello":null}`, `{"hello":"Yw"}`} {
		_, e := Hello(context.Background(), o.Address, o.Pin, func(*http.Request) (*http.Response, error) { return response(200, raw), nil }, "")
		if !errors.Is(e, errors.InvalidData) {
			t.Fatal(e)
		}
	}
}
func TestSharedHelloCache(t *testing.T) {
	o, greeting := fixture(t)
	o.HelloCache = NewHelloCache()
	hellos := 0
	o.Fetcher = func(req *http.Request) (*http.Response, error) {
		if welcome := greeting(req); welcome != nil {
			hellos++
			return welcome, nil
		}
		return response(200, `{}`), nil
	}
	for _, c := range []*Client{CreateClient(o), CreateClient(o).ForVault(make([]byte, 32))} {
		r, e := c.Request(context.Background(), "/v1/head", "GET", nil)
		if e != nil {
			t.Fatal(e)
		}
		r.Body.Close()
	}
	if hellos != 1 {
		t.Fatal(hellos)
	}
}
