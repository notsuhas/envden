package push

import (
	"bytes"
	"context"
	"encoding/json"
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	state "github.com/notsuhas/envden/go/cli/state/model"
	f "github.com/notsuhas/envden/go/cli/sync/local/files"
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/core/adapters"
	chain "github.com/notsuhas/envden/go/core/chain/manifests"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	members "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/requests"
	fake "github.com/notsuhas/envden/go/testing/placement"
	"io"
	"net/http"
	"path/filepath"
	"strings"
	"testing"
)

func TestTwoCopiesShareUploadAndKeepBothBases(t *testing.T) {
	check := func(err error) {
		t.Helper()
		if err != nil {
			t.Fatal(err)
		}
	}
	home := t.TempDir()
	clock := func() int64 { return 1800000000000 }
	device, err := keys.GenerateDeviceKeys()
	check(err)
	id, err := keys.DeviceID(device.EncPub, device.ObjPub, device.ReqPub)
	check(err)
	ident := identity.Identity{Keys: identity.SecretKeys{EncSk: device.EncSk, ObjSk: device.ObjSk, ReqSk: device.ReqSk}, Record: members.DeviceRecord{Id: id, Name: "first", EncPub: device.EncPub, ObjPub: device.ObjPub, ReqPub: device.ReqPub}}
	server, err := keys.GenerateRecoveryKeys()
	check(err)
	pin, err := keys.ServerPin(server.ObjPub)
	check(err)
	uploads := 0
	fetch := func(req *http.Request) (*http.Response, error) {
		raw := []byte("{}")
		if req.URL.Path == "/v1/hello" {
			challenge, err := client.Binary(req.URL.Query().Get("challenge"))
			check(err)
			hello, err := requests.BuildHello(serverprotocol.ServerHello{Challenge: challenge, Host: req.URL.Hostname(), ServerSignPub: server.ObjPub, AppVersion: "999.0.0", MinClient: "0.0.0", Protocols: []int{1}}, server.ObjSk)
			check(err)
			raw, err = json.Marshal(serverprotocol.HelloResponse{Hello: client.Text(b.SignedCodec(serverprotocol.ServerHelloCodec).Write(hello))})
			check(err)
		} else if req.Method == "PUT" && strings.HasPrefix(req.URL.Path, "/v1/blobs/") {
			uploads++
		} else {
			t.Fatal("unexpected request", req.Method, req.URL.Path)
		}
		return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(bytes.NewReader(raw))}, nil
	}
	vaultID := bytes.Repeat([]byte{1}, 32)
	placement := fake.CreateFakePlacementAdapter(fake.Operations{Inspect: func(string, string) (adapters.PlacementState, error) { return adapters.PlacementLinked, nil }})
	sc := &sm.Context{Context: context.Background(), Adapters: contracts.Adapters{Home: home, Now: clock, Placement: func(adapters.PlacementMode, string) adapters.Placement { return placement }}, State: state.EmptyState("first"), Options: sm.Options{Now: clock}, VaultID: vaultID, Checkpoint: chain.Checkpoint{IdKey: bytes.Repeat([]byte{2}, 32), Header: b.Signed[m.ManifestHeader]{Body: m.ManifestHeader{Epoch: 1}}}, Keys: map[int][]byte{1: bytes.Repeat([]byte{3}, 32)}, Client: client.CreateClient(client.Options{Address: "https://fixture.invalid", Pin: pin, VaultID: vaultID, Identity: ident, Version: "999.0.0", Now: clock, Fetcher: fetch})}
	files := m.Files{Entries: []m.FileEntry{}}
	changed := map[string]change{}
	order := []string{}
	seen := map[string][]byte{}
	store := filepath.Join(home, "store", ".env")
	check(f.WriteBytes(store, []byte("KEY=changed\n"), clock))
	for _, name := range []string{"one", "two"} {
		root := filepath.Join(home, name)
		sc.State.Approved = append(sc.State.Approved, state.Checkout{Root: root, GitDir: filepath.Join(root, ".git"), RepoID: "repo"})
		check(f.WriteBytes(filepath.Join(root, ".env"), []byte("KEY=changed\n"), clock))
		check(uploadLink(sc, map[string]bool{"repo": true}, state.Link{Root: root, Path: ".env", Store: store, Mode: "copy"}, &files, changed, &order, seen))
	}
	if uploads != 1 || len(files.Entries) != 1 || len(changed) != 2 {
		t.Fatal(uploads, len(files.Entries), len(changed))
	}
}
