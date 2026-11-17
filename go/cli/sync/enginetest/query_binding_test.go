package enginetest

import (
	"net/http"
	"net/url"
	"testing"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/vault"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/requests"
)

func TestSignedQueryBinding(t *testing.T) {
	f := createConfiguredFixture(t, fixtureOptions{devices: 1, bare: true, password: "master password"})
	for _, row := range []struct {
		name, raw, signed string
		rejected          bool
	}{
		{"empty canonical", "/v1/head?", "/v1/head", false},
		{"empty raw", "/v1/head?", "/v1/head?", true},
		{"apostrophe canonical", "/v1/head?q='", "/v1/head?q=%27", false},
		{"apostrophe raw", "/v1/head?q='", "/v1/head?q='", true},
		{"ordinary", "/v1/head?z=%2f&x=a+b&z=%27", "/v1/head?z=%2f&x=a+b&z=%27", false},
	} {
		t.Run(row.name, func(t *testing.T) {
			a := f.first
			var secret []byte
			a.Fetcher = func(r *http.Request) (*http.Response, error) {
				if r.Header.Get("Envden-Request") != "" {
					if row.name == "empty raw" {
						binary, err := client.Binary(r.Header.Get("Envden-Request"))
						must(t, err)
						value, err := encoding.Decode(wire.RequestCodec, binary)
						must(t, err)
						value.PathAndQuery = row.signed
						signed, err := requests.SignRequest(value, secret)
						must(t, err)
						binary, err = encoding.Encode(wire.RequestCodec, value)
						must(t, err)
						r.Header.Set("Envden-Request", client.Text(binary))
						r.Header.Set("Envden-Signature", client.Text(signed.Signature))
					}
					target, err := url.Parse(row.raw)
					must(t, err)
					r.URL.Path, r.URL.RawPath = target.Path, target.RawPath
					r.URL.RawQuery, r.URL.ForceQuery = target.RawQuery, target.ForceQuery
				}
				return client.DefaultFetch(r)
			}
			connection, err := vault.VaultConnection(f.ctx, a, f.state(a), nil)
			must(t, err)
			secret = connection.Identity.Keys.ReqSk
			response, err := connection.Client.Request(f.ctx, row.signed, "GET", nil)
			if row.rejected {
				if !envdenerrors.Is(err, envdenerrors.Unauthorized) {
					t.Fatalf("raw binding error = %v, want UNAUTHORIZED", err)
				}
				return
			}
			must(t, err)
			must(t, response.Body.Close())
			equal(t, response.StatusCode, http.StatusOK)
		})
	}
}
