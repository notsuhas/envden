package client_test

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"io"
	"net/http"
	"testing"

	"github.com/notsuhas/envden/go/cli/client"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/requests"
)

func TestCanonicalHelloHost(t *testing.T) {
	for _, row := range []struct{ address, host string }{{"http://127.1:8443", "127.0.0.1"}, {"http://2130706433:8443", "127.0.0.1"}, {"http://127.0.0.01:8443", "127.0.0.1"}, {"http://LOCALHOST:8443", "localhost"}, {"http://[fd7a:115c:a1e0:0:0:0:0:1]:8443", "[fd7a:115c:a1e0::1]"}, {"http://bücher.example:8443", "xn--bcher-kva.example"}} {
		t.Run(row.address, func(t *testing.T) {
			pub, priv, _ := ed25519.GenerateKey(rand.Reader)
			seed := priv.Seed()
			pin, _ := keys.ServerPin(pub)
			fetch := func(r *http.Request) (*http.Response, error) {
				ch, _ := client.Binary(r.URL.Query().Get("challenge"))
				h, err := requests.BuildHello(wire.ServerHello{Challenge: ch, Host: row.host, ServerSignPub: pub, AppVersion: "9.0.0", MinClient: "0.0.0", Protocols: []int{1}}, seed)
				if err != nil {
					t.Fatal(err)
				}
				raw, _ := encoding.Encode(encoding.SignedCodec(wire.ServerHelloCodec), h)
				body := `{"hello":"` + client.Text(raw) + `"}`
				return &http.Response{StatusCode: 200, Body: io.NopCloser(bytes.NewBufferString(body)), Header: http.Header{}}, nil
			}
			_, err := client.Hello(context.Background(), row.address, pin, fetch, "0.0.0")
			t.Logf("err=%v", err)
			if err != nil {
				t.Fail()
			}
		})
	}
}
