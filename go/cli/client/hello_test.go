package client

import (
	"context"
	"net/http"
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestHelloBeforeMemberRequests(t *testing.T) {
	o, greeting := fixture(t) //nolint:bodyclose // The fixture returns a fetch function, not an open response.
	o.Pin = make([]byte, 32)
	signed := 0
	o.Fetcher = func(req *http.Request) (*http.Response, error) {
		if welcome := greeting(req); welcome != nil {
			return welcome, nil
		}

		signed++

		return response(200, `{}`), nil
	}
	result, e := CreateClient(o).Request(context.Background(), "/v1/head", "GET", nil)
	if result != nil {
		if err := result.Body.Close(); err != nil {
			t.Fatal(err)
		}
	}

	if !errors.Is(e, errors.Unauthorized) {
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
	o, greeting := fixture(t) //nolint:bodyclose // The fixture returns a fetch function, not an open response.
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

		if err := r.Body.Close(); err != nil {
			t.Fatal(err)
		}
	}

	if hellos != 1 {
		t.Fatal(hellos)
	}
}
