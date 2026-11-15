package client

import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/requests"
)

func TestMinimumUsesFreshSignedHello(t *testing.T) {
	for _, published := range []bool{false, true} {
		o, _ := fixture(t) //nolint:bodyclose // The fixture returns a fetch function, not an open response.
		server, _ := keys.GenerateRecoveryKeys()
		o.Pin, _ = keys.ServerPin(server.ObjPub)
		o.Fetcher = func(req *http.Request) (*http.Response, error) {
			if strings.HasSuffix(req.URL.Hostname(), "github.com") {
				if published && req.URL.Hostname() == "api.github.com" {
					return response(200, `{"tag_name":"v1.0.0"}`), nil
				}

				return response(503, `{}`), nil
			}

			if req.URL.Path != "/v1/hello" {
				return response(426, `{"minClient":"99.0.0"}`), nil
			}

			challenge, _ := Binary(req.URL.Query().Get("challenge"))
			signed, _ := requests.BuildHello(serverprotocol.ServerHello{Challenge: challenge, Host: req.URL.Hostname(), ServerSignPub: server.ObjPub, AppVersion: "1.0.0", MinClient: "2.0.0", Protocols: []int{1}}, server.ObjSk)
			raw, _ := encoding.Encode(encoding.SignedCodec(serverprotocol.ServerHelloCodec), signed)
			body, _ := json.Marshal(serverprotocol.HelloResponse{Hello: Text(raw)})

			return response(200, string(body)), nil
		}
		result, e := CreateClient(o).Request(context.Background(), "/v1/test", "GET", nil)
		if result != nil {
			if err := result.Body.Close(); err != nil {
				t.Fatal(err)
			}
		}

		if !errors.Is(e, errors.ClientTooOld) {
			t.Fatal(e)
		}

		expected := "signed server minimum"
		if published {
			expected = "doesn't exist"
		}

		if !strings.Contains(e.Error(), expected) {
			t.Fatal(e)
		}
	}
}
