package client

import (
	"context"
	"encoding/json"
	"github.com/notsuhas/envden/go/core/errors"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/requests"
	"net/http"
	"strings"
	"testing"
)

func TestMinimumUsesFreshSignedHello(t *testing.T) {
	for _, published := range []bool{false, true} {
		o, _ := fixture(t)
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
			signed, _ := requests.BuildHello(p.ServerHello{Challenge: challenge, Host: req.URL.Hostname(), ServerSignPub: server.ObjPub, AppVersion: "1.0.0", MinClient: "2.0.0", Protocols: []int{1}}, server.ObjSk)
			raw, _ := b.Encode(b.SignedCodec(p.ServerHelloCodec), signed)
			body, _ := json.Marshal(p.HelloResponse{Hello: Text(raw)})
			return response(200, string(body)), nil
		}
		_, e := CreateClient(o).Request(context.Background(), "/v1/test", "GET", nil)
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
