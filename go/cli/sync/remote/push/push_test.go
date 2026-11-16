package push

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	state "github.com/notsuhas/envden/go/cli/state/model"
	storepath "github.com/notsuhas/envden/go/cli/store"
	"github.com/notsuhas/envden/go/cli/sync/local"
	localfiles "github.com/notsuhas/envden/go/cli/sync/local/files"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/sync/remote/attempt"
	"github.com/notsuhas/envden/go/core/adapters"
	chain "github.com/notsuhas/envden/go/core/chain/manifests"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/requests"
	fake "github.com/notsuhas/envden/go/testing/placement"
)

func TestUncertainPushAcknowledgement(t *testing.T) {
	home, root := t.TempDir(), t.TempDir()
	clock := func() int64 { return 1700000000000 }
	device, err := keys.GenerateDeviceKeys()
	if err != nil {
		t.Fatal(err)
	}

	id, err := keys.DeviceID(device.EncPub, device.ObjPub, device.ReqPub)
	if err != nil {
		t.Fatal(err)
	}

	ident := identity.Identity{Keys: identity.SecretKeys{EncSk: device.EncSk, ObjSk: device.ObjSk, ReqSk: device.ReqSk}, Record: members.DeviceRecord{Id: id, Name: "fixture", EncPub: device.EncPub, ObjPub: device.ObjPub, ReqPub: device.ReqPub}}
	server, err := keys.GenerateRecoveryKeys()
	if err != nil {
		t.Fatal(err)
	}

	pin, err := keys.ServerPin(server.ObjPub)
	if err != nil {
		t.Fatal(err)
	}

	files := manifests.Files{Entries: []manifests.FileEntry{}}
	body := manifests.ManifestHeader{VaultId: bytes.Repeat([]byte{1}, 32), Seq: 1, Prev: make([]byte, 32), ListHead: make([]byte, 32), Epoch: 1, KeyringHash: make([]byte, 32), FilesHash: crypto.H("files", manifests.FilesCodec.Write(files)), EnvelopeHash: make([]byte, 32), Signer: id}
	header, err := crypto.SignObject(manifests.ManifestHeaderCodec, body, device.ObjSk, "manifest")
	if err != nil {
		t.Fatal(err)
	}

	var swap manifests.Swap
	calls := 0
	fetch := func(req *http.Request) (*http.Response, error) {
		raw := []byte(`{}`)
		status := 200

		switch {
		case req.URL.Path == "/v1/hello":
			challenge, err := client.Binary(req.URL.Query().Get("challenge"))
			if err != nil {
				t.Fatal(err)
			}
			hello, err := requests.BuildHello(serverprotocol.ServerHello{Challenge: challenge, Host: req.URL.Hostname(), ServerSignPub: server.ObjPub, AppVersion: "999.0.0", MinClient: "0.0.0", Protocols: []int{1}}, server.ObjSk)
			if err != nil {
				t.Fatal(err)
			}
			raw, err = json.Marshal(serverprotocol.HelloResponse{Hello: client.Text(encoding.SignedCodec(serverprotocol.ServerHelloCodec).Write(hello))})
			if err != nil {
				t.Fatal(err)
			}
		case req.URL.Path == "/v1/swap":
			calls++
			encoded, err := io.ReadAll(req.Body)
			if err != nil {
				t.Fatal(err)
			}
			swap, err = encoding.Decode(manifests.SwapCodec, encoded)
			if err != nil {
				t.Fatal(err)
			}
			status = 409
			raw = []byte(`{"error":"HEAD_MOVED"}`)
		case req.Method == "PUT":
		default:
			t.Fatalf("unexpected request %s", req.URL.Path)
		}

		return &http.Response{StatusCode: status, Header: http.Header{}, Body: io.NopCloser(bytes.NewReader(raw))}, nil
	}
	store, err := storepath.StorePath(home, "example/repo", ".env")
	if err != nil {
		t.Fatal(err)
	}
	if err = localfiles.WriteBytes(store, []byte("TOKEN=fixture\n"), clock); err != nil {
		t.Fatal(err)
	}

	localState := state.EmptyState("fixture")
	localState.Approved = []state.Checkout{{Root: root, RepoID: "example/repo"}}
	localState.Links = []state.Link{{Root: root, Path: ".env", Store: store, Mode: "link"}}
	placement := fake.CreateFakePlacementAdapter(fake.Operations{Inspect: func(string, string) (adapters.PlacementState, error) { return adapters.PlacementLinked, nil }})
	sc := &syncmodel.Context{Context: context.Background(), Adapters: contracts.Adapters{Home: home, Now: clock, Placement: func(adapters.PlacementMode, string) adapters.Placement { return placement }}, Options: syncmodel.Options{Now: clock}, State: localState, SkippedRoots: map[string]bool{}, Identity: ident, VaultID: body.VaultId, Checkpoint: chain.Checkpoint{Header: header, Files: files, IdKey: bytes.Repeat([]byte{2}, 32)}, Keys: map[int][]byte{1: bytes.Repeat([]byte{3}, 32)}, Headers: []encoding.Signed[manifests.ManifestHeader]{header}, Client: client.CreateClient(client.Options{Address: "https://fixture.invalid", Pin: pin, VaultID: body.VaultId, Identity: ident, Version: "999.0.0", Now: clock, Fetcher: fetch})}

	if _, err = UploadChanges(sc, map[string]bool{"example/repo": true}, nil); !envdenerrors.Is(err, envdenerrors.HeadMoved) {
		t.Fatal(err)
	}

	receipts, err := os.ReadDir(filepath.Join(home, "state", "attempts"))
	if err != nil || len(receipts) != 1 {
		t.Fatal(receipts, err)
	}

	if sc.Checkpoint.Header.Body.Seq != 1 || calls != 1 {
		t.Fatal("failed push advanced checkpoint")
	}

	sc.Checkpoint.Header = swap.Header
	sc.Checkpoint.Files = *swap.Files
	sc.Headers = append(sc.Headers, swap.Header)
	if err = attempt.AcknowledgeAttempt(sc); err != nil {
		t.Fatal(err)
	}

	applied, err := local.AppliedFiles(home)
	if err != nil || !local.HasAppliedEntry(swap.Files.Entries[0], applied) {
		t.Fatal(applied, err)
	}

	baseline, err := localfiles.ReadBytes(localfiles.BasePath(home, store))
	if err != nil || string(baseline) != "TOKEN=fixture\n" {
		t.Fatal(string(baseline), err)
	}

	receipts, err = os.ReadDir(filepath.Join(home, "state", "attempts"))
	if err != nil || len(receipts) != 0 {
		t.Fatal(receipts, err)
	}

	changed, err := UploadChanges(sc, map[string]bool{"example/repo": true}, nil)
	if err != nil || changed != 0 || calls != 1 {
		t.Fatal(changed, calls, err)
	}
}
