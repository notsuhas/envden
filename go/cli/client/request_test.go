package client

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/requests"
	"io"
	"net/http"
	"reflect"
	"testing"
)

func response(status int, body string) *http.Response {
	return &http.Response{StatusCode: status, Body: io.NopCloser(bytes.NewBufferString(body)), Header: http.Header{}}
}
func fixture(t *testing.T) (Options, func(*http.Request) *http.Response) {
	t.Helper()
	server, err := keys.GenerateRecoveryKeys()
	if err != nil {
		t.Fatal(err)
	}
	device, err := keys.GenerateDeviceKeys()
	if err != nil {
		t.Fatal(err)
	}
	id, _ := keys.DeviceID(device.EncPub, device.ObjPub, device.ReqPub)
	pin, _ := keys.ServerPin(server.ObjPub)
	options := Options{Address: "https://server.example", Pin: pin, VaultID: make([]byte, 32), Identity: identity.Identity{Keys: identity.SecretKeys{EncSk: device.EncSk, ObjSk: device.ObjSk, ReqSk: device.ReqSk}, Record: members.DeviceRecord{Id: id, Name: "device", EncPub: device.EncPub, ObjPub: device.ObjPub, ReqPub: device.ReqPub}}, Version: "1.0.0", Now: func() int64 { return 1000000 }}
	greeting := func(req *http.Request) *http.Response {
		if req.URL.Path != "/v1/hello" {
			return nil
		}
		challenge, err := Binary(req.URL.Query().Get("challenge"))
		if err != nil {
			t.Fatal(err)
		}
		signed, err := requests.BuildHello(p.ServerHello{Challenge: challenge, Host: req.URL.Hostname(), ServerSignPub: server.ObjPub, AppVersion: "1.0.0", MinClient: "0.0.0", Protocols: []int{1}}, server.ObjSk)
		if err != nil {
			t.Fatal(err)
		}
		raw, _ := b.Encode(b.SignedCodec(p.ServerHelloCodec), signed)
		body, _ := json.Marshal(p.HelloResponse{Hello: Text(raw)})
		return response(200, string(body))
	}
	return options, greeting
}

func TestSignedRequest(t *testing.T) {
	options, greeting := fixture(t)
	attempts, unlocked := 0, 0
	options.Unlock = func(context.Context) error { unlocked++; return nil }
	options.Fetcher = func(req *http.Request) (*http.Response, error) {
		if hello := greeting(req); hello != nil {
			return hello, nil
		}
		attempts++
		raw, err := Binary(req.Header.Get("Envden-Request"))
		if err != nil {
			t.Fatal(err)
		}
		value, err := b.Decode(p.RequestCodec, raw)
		if err != nil {
			t.Fatal(err)
		}
		signature, _ := Binary(req.Header.Get("Envden-Signature"))
		body, _ := io.ReadAll(req.Body)
		if string(body) != `{"z":"<value>","a":1}` {
			t.Fatal(string(body))
		}
		verified, err := requests.VerifyRequest(b.Signed[p.Request]{Body: value, Signature: signature}, options.Identity.Record.ReqPub, options.Pin, body, 1000000, false)
		if err != nil || !verified.OK {
			t.Fatal(verified, err)
		}
		if value.PathAndQuery != "/v1/test?q=1" || value.Method != "POST" || req.Header.Get("Content-Type") != "application/json" {
			t.Fatal(value, req.Header)
		}
		if req.Header.Get("Envden-Body-Hash") != Text(value.BodyHash) || req.Header.Get("Envden-Time") != "1000000" || req.Header.Get("Envden-Device") != Text(options.Identity.Record.Id) {
			t.Fatal(req.Header)
		}
		if attempts == 1 {
			return response(403, `{"error":"LOCKED"}`), nil
		}
		return response(200, `{"kind":"ok"}`), nil
	}
	c := CreateClient(options)
	result, err := c.Request(context.Background(), "/v1/test?q=1", "POST", jsonvalue.Object{{Key: "z", Value: "<value>"}, {Key: "a", Value: 1}})
	if err != nil {
		t.Fatal(err)
	}
	result.Body.Close()
	if attempts != 2 || unlocked != 1 {
		t.Fatal(attempts, unlocked)
	}
	if _, err = c.Request(context.Background(), "https://other.example/", "GET", nil); !errors.Is(err, errors.InvalidInput) {
		t.Fatal(err)
	}
}

func TestBusyAndBinary(t *testing.T) {
	for _, recover := range []bool{true, false} {
		options, greeting := fixture(t)
		attempts := 0
		delays := []int64{}
		nonces := map[string]bool{}
		body := bytes.Repeat([]byte{42}, 48)
		options.Backoff = func(ms int64) error { delays = append(delays, ms); return nil }
		options.Fetcher = func(req *http.Request) (*http.Response, error) {
			if hello := greeting(req); hello != nil {
				return hello, nil
			}
			attempts++
			nonce := req.Header.Get("Envden-Nonce")
			if nonces[nonce] {
				t.Fatal("reused nonce")
			}
			nonces[nonce] = true
			raw, _ := io.ReadAll(req.Body)
			if !bytes.Equal(raw, body) || req.Header.Get("Envden-Body-Hash") != Text(crypto.SHA256(body)) {
				t.Fatal("body changed")
			}
			if recover && attempts == 3 {
				return response(200, `{"kind":"committed"}`), nil
			}
			return response(503, `{"error":"BUSY"}`), nil
		}
		r, err := CreateClient(options).Request(context.Background(), "/v1/swap", "POST", body)
		if recover {
			if err != nil {
				t.Fatal(err)
			}
			r.Body.Close()
		} else if !errors.Is(err, errors.Busy) {
			t.Fatal(err)
		}
		if attempts != 3 || !reflect.DeepEqual(delays, []int64{100, 200}) {
			t.Fatal(attempts, delays)
		}
	}
}

func TestErrorsAndEncoding(t *testing.T) {
	for _, row := range []struct {
		raw, path string
		code      errors.Code
		contains  string
	}{{`{"error":"SERVER_UNREACHABLE"}`, "", errors.ServerUnreachable, "storage"}, {`{"error":"MADE_UP"}`, "", errors.InvalidData, "Invalid server response"}, {`{"kind":"head-moved"}`, "", errors.HeadMoved, "changed"}, {`{"error":"CONFLICT"}`, "/v1/pairing/mailboxes/4/a", errors.Conflict, "envden device add"}, {`{"error":"UNAUTHORIZED"}`, "/v1/opaque/login/start", errors.Unauthorized, "Login expired"}} {
		err := ResponseError(response(403, row.raw), row.path)
		if !errors.Is(err, row.code) || !bytes.Contains([]byte(err.Error()), []byte(row.contains)) {
			t.Fatal(err)
		}
	}
	for _, value := range []string{"!", "YQ=", "YQ==", "YR"} {
		if _, err := Binary(value); !errors.Is(err, errors.InvalidData) {
			t.Fatal(value, err)
		}
	}
	_, err := ServerFetch(func(*http.Request) (*http.Response, error) { return nil, io.ErrUnexpectedEOF }, nil)
	if !errors.Is(err, errors.ServerUnreachable) || bytes.Contains([]byte(err.Error()), []byte("EOF")) {
		t.Fatal(err)
	}
}
