package remote

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"testing"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/identity"
	state "github.com/notsuhas/envden/go/cli/state/model"
	syncmodel "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/core/chain/devices"
	chain "github.com/notsuhas/envden/go/core/chain/manifests"
	envdenerrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	serverprotocol "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/core/protocol/requests"
)

func TestAcceptRemoteHeads(t *testing.T) {
	for _, scenario := range []string{"unchanged", "rollback", "fork", "advance"} {
		t.Run(scenario, func(t *testing.T) {
			clock := func() int64 { return 1700000000000 }
			server, err := keys.GenerateRecoveryKeys()
			if err != nil {
				t.Fatal(err)
			}

			device, err := keys.GenerateDeviceKeys()
			if err != nil {
				t.Fatal(err)
			}

			id, err := keys.DeviceID(device.EncPub, device.ObjPub, device.ReqPub)
			if err != nil {
				t.Fatal(err)
			}

			pin, err := keys.ServerPin(server.ObjPub)
			if err != nil {
				t.Fatal(err)
			}

			ident := identity.Identity{Keys: identity.SecretKeys{EncSk: device.EncSk, ObjSk: device.ObjSk, ReqSk: device.ReqSk}, Record: members.DeviceRecord{Id: id, Name: "fixture", EncPub: device.EncPub, ObjPub: device.ObjPub, ReqPub: device.ReqPub}}
			genesis, err := vault.CreateGenesis(ident, pin, clock())
			if err != nil {
				t.Fatal(err)
			}

			entries := []encoding.Signed[codecs.Entry]{genesis.Genesis, genesis.Epoch}
			verified, err := devices.VerifyChain(entries)
			if err != nil {
				t.Fatal(err)
			}

			files := manifests.Files{Entries: []manifests.FileEntry{}}
			body := manifests.ManifestHeader{VaultId: genesis.VaultID, Seq: 1, Prev: make([]byte, 32), ListSeq: 1, ListHead: verified.State.Head, Epoch: 1, KeyringHash: crypto.H("keyring-blob", genesis.Keyring), FilesHash: crypto.H("files", manifests.FilesCodec.Write(files)), EnvelopeHash: bytes.Repeat([]byte{4}, 32), CreatedAt: uint64(clock()), Signer: id} //nolint:gosec // The fixture clock is a positive Unix millisecond constant.
			first, err := crypto.SignObject(manifests.ManifestHeaderCodec, body, device.ObjSk, "manifest")
			if err != nil {
				t.Fatal(err)
			}

			previous, err := crypto.ObjectHash(manifests.ManifestHeaderCodec, first, "manifest")
			if err != nil {
				t.Fatal(err)
			}

			nextFiles := files

			if scenario == "advance" {
				nextFiles = manifests.Files{Entries: []manifests.FileEntry{{FileId: bytes.Repeat([]byte{7}, 32), Version: 1, Epoch: 1, State: 2, BlobHash: make([]byte, 32), Name: []byte{}}}}
				body.FilesHash = crypto.H("files", manifests.FilesCodec.Write(nextFiles))
			}

			body.Seq = 2
			body.Op = 1
			body.Prev = previous
			second, err := crypto.SignObject(manifests.ManifestHeaderCodec, body, device.ObjSk, "manifest")
			if err != nil {
				t.Fatal(err)
			}

			checkpoint, head := first, first
			headers := []encoding.Signed[manifests.ManifestHeader]{first}

			switch scenario {
			case "rollback":
				checkpoint = second
				headers = append(headers, second)
			case "fork":
				body = first.Body
				body.CreatedAt++
				head, err = crypto.SignObject(manifests.ManifestHeaderCodec, body, device.ObjSk, "manifest")
				if err != nil {
					t.Fatal(err)
				}
			case "advance":
				head = second
			}

			fetch := func(req *http.Request) (*http.Response, error) {
				var raw []byte

				switch req.URL.Path {
				case "/v1/hello":
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
				case "/v1/head":
					raw = encoding.SignedCodec(manifests.ManifestHeaderCodec).Write(head)
				case "/v1/files/" + client.Text(body.FilesHash):
					raw = manifests.FilesCodec.Write(nextFiles)
				default:
					t.Fatalf("unexpected request %s", req.URL.Path)
				}

				return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(bytes.NewReader(raw))}, nil
			}
			sc := &syncmodel.Context{Context: context.Background(), Adapters: contracts.Adapters{Home: t.TempDir(), Now: clock}, Options: syncmodel.Options{Now: clock}, State: state.EmptyState("fixture"), VaultID: genesis.VaultID, Identity: ident, Checkpoint: chain.Checkpoint{Header: checkpoint, Files: files, State: verified.State, IdKey: genesis.IDKey}, Headers: headers, Entries: entries, Keys: map[int][]byte{1: genesis.EpochKey}, Client: client.CreateClient(client.Options{Address: "https://fixture.invalid", Pin: pin, VaultID: genesis.VaultID, Identity: ident, Version: "999.0.0", Now: clock, Fetcher: fetch})}
			history := vault.History{Entries: entries, Headers: append([]encoding.Signed[manifests.ManifestHeader]{}, head), State: verified.State}

			if scenario == "advance" {
				history.Headers = []encoding.Signed[manifests.ManifestHeader]{first, second}
			}

			_, err = AcceptHead(sc, &history, false)

			if scenario == "rollback" {
				if !envdenerrors.Is(err, envdenerrors.Rollback) {
					t.Fatal(err)
				}

				return
			}

			if scenario == "fork" {
				if !envdenerrors.Is(err, envdenerrors.Fork) {
					t.Fatal(err)
				}

				return
			}
			if err != nil {
				t.Fatal(err)
			}

			if sc.Checkpoint.Header.Body.Seq != head.Body.Seq {
				t.Fatal("checkpoint did not advance")
			}
		})
	}
}
