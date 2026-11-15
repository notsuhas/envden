package session

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/opaque"
	"github.com/notsuhas/envden/go/core/protocol/requests"
	"io"
	"net/http"
	"strings"
	"testing"
)

func TestRegistrationLoginAndWindow(t *testing.T) {
	server, _ := keys.GenerateRecoveryKeys()
	device, _ := keys.GenerateDeviceKeys()
	id, _ := keys.DeviceID(device.EncPub, device.ObjPub, device.ReqPub)
	pin, _ := keys.ServerPin(server.ObjPub)
	vault := make([]byte, 32)
	ids, _ := opaque.UnlockIdentifiers(vault)
	setup, _ := opaque.OpaqueCreateSetup()
	record, loginState := "", ""
	windowStatus := 200
	respond := func(status int, v any) *http.Response {
		raw, _ := json.Marshal(v)
		return &http.Response{StatusCode: status, Body: io.NopCloser(bytes.NewReader(raw)), Header: http.Header{}}
	}
	fetch := func(req *http.Request) (*http.Response, error) {
		if req.URL.Path == "/v1/hello" {
			challenge, _ := client.Binary(req.URL.Query().Get("challenge"))
			signed, e := requests.BuildHello(p.ServerHello{Challenge: challenge, Host: "server.example", ServerSignPub: server.ObjPub, AppVersion: "1.0.0", MinClient: "0.0.0", Protocols: []int{1}}, server.ObjSk)
			if e != nil {
				t.Fatal(e)
			}
			raw, _ := b.Encode(b.SignedCodec(p.ServerHelloCodec), signed)
			return respond(200, p.HelloResponse{Hello: client.Text(raw)}), nil
		}
		raw, _ := io.ReadAll(req.Body)
		var message struct{ Purpose, Message string }
		json.Unmarshal(raw, &message)
		switch req.URL.Path {
		case "/v1/opaque/registration/start":
			result, e := opaque.OpaqueRegistrationResponse(opaque.RegistrationResponseParams{ServerSetup: setup, UserIdentifier: ids.UserIdentifier, RegistrationRequest: message.Message})
			if e != nil {
				t.Fatal(e)
			}
			return respond(200, map[string]string{"message": result.RegistrationResponse}), nil
		case "/v1/opaque/registration/finish":
			record = message.Message
			return respond(200, map[string]string{"kind": "registered"}), nil
		case "/v1/opaque/login/start":
			result, e := opaque.OpaqueServerStartLogin(opaque.ServerStartLoginParams{ServerSetup: setup, UserIdentifier: ids.UserIdentifier, Identifiers: ids.Identifiers, RegistrationRecord: &record, StartLoginRequest: message.Message})
			if e != nil {
				t.Fatal(e)
			}
			loginState = result.ServerLoginState
			return respond(200, map[string]string{"message": result.LoginResponse}), nil
		case "/v1/opaque/login/finish":
			_, e := opaque.OpaqueServerFinishLogin(opaque.ServerFinishLoginParams{Identifiers: ids.Identifiers, ServerLoginState: loginState, FinishLoginRequest: message.Message})
			if e != nil {
				t.Fatal(e)
			}
			if message.Purpose == "kit" {
				return respond(200, map[string]string{"kind": "ticket"}), nil
			}
			return respond(200, map[string]any{"kind": "unlocked", "unlockedUntil": nil, "freshUntil": 10000}), nil
		case "/v1/unlock-window":
			if windowStatus != 200 {
				return respond(windowStatus, map[string]string{"error": "LOCKED"}), nil
			}
			return respond(200, map[string]any{"unlockedUntil": nil, "freshUntil": 20000}), nil
		}
		t.Fatal("unexpected route", req.URL.Path)
		return nil, nil
	}
	c := client.CreateClient(client.Options{Address: "https://server.example", Pin: pin, VaultID: vault, Identity: identity.Identity{Keys: identity.SecretKeys{EncSk: device.EncSk, ObjSk: device.ObjSk, ReqSk: device.ReqSk}, Record: members.DeviceRecord{Id: id, Name: "device", EncPub: device.EncPub, ObjPub: device.ObjPub, ReqPub: device.ReqPub}}, Version: "1.0.0", Now: func() int64 { return 0 }, Fetcher: fetch})
	ctx := context.Background()
	saved, e := RegisterPassword(ctx, c, vault, "password")
	if e != nil || record == "" || saved != record {
		t.Fatal(saved, e)
	}
	window, e := Login(ctx, c, vault, Password{Value: "password"}, "")
	if e != nil || window == nil || window.UnlockedUntil != nil || window.FreshUntil != 10000 {
		t.Fatal(window, e)
	}
	if _, e = Login(ctx, c, vault, Password{Value: "wrong"}, ""); !errors.Is(e, errors.Unauthorized) || !strings.Contains(e.Error(), "Wrong master password") {
		t.Fatal(e)
	}
	attempts := 0
	_, e = Login(ctx, c, vault, Password{Prompt: func(retry bool) (string, error) {
		attempts++
		if retry != (attempts > 1) {
			t.Fatal(retry, attempts)
		}
		return "wrong", nil
	}}, "")
	if !errors.Is(e, errors.Unauthorized) || attempts != 3 {
		t.Fatal(attempts, e)
	}
	window, e = Login(ctx, c, vault, Password{Value: "password"}, "kit")
	if e != nil || window != nil {
		t.Fatal(window, e)
	}
	state := model.EmptyState("test")
	if e = RecordUnlockWindow(ctx, c, state); e != nil || state.Session.FreshUntil != 20000 {
		t.Fatal(e)
	}
	windowStatus = 403
	if e = RecordUnlockWindow(ctx, c, state); e != nil || state.Session.FreshUntil != 20000 {
		t.Fatal(e)
	}
}
