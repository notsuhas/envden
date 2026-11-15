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
	sm "github.com/notsuhas/envden/go/cli/sync/model"
	"github.com/notsuhas/envden/go/cli/vault"
	"github.com/notsuhas/envden/go/core/chain/devices"
	chain "github.com/notsuhas/envden/go/core/chain/manifests"
	e "github.com/notsuhas/envden/go/core/errors"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	mem "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
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
			ident := identity.Identity{Keys: identity.SecretKeys{EncSk: device.EncSk, ObjSk: device.ObjSk, ReqSk: device.ReqSk}, Record: mem.DeviceRecord{Id: id, Name: "fixture", EncPub: device.EncPub, ObjPub: device.ObjPub, ReqPub: device.ReqPub}}
			genesis, err := vault.CreateGenesis(ident, pin, clock())
			if err != nil {
				t.Fatal(err)
			}
			entries := []b.Signed[c.Entry]{genesis.Genesis, genesis.Epoch}
			verified, err := devices.VerifyChain(entries)
			if err != nil {
				t.Fatal(err)
			}
			files := m.Files{Entries: []m.FileEntry{}}
			body := m.ManifestHeader{VaultId: genesis.VaultID, Seq: 1, Prev: make([]byte, 32), ListSeq: 1, ListHead: verified.State.Head, Epoch: 1, KeyringHash: cr.H("keyring-blob", genesis.Keyring), FilesHash: cr.H("files", m.FilesCodec.Write(files)), EnvelopeHash: bytes.Repeat([]byte{4}, 32), CreatedAt: uint64(clock()), Signer: id}
			first, err := cr.SignObject(m.ManifestHeaderCodec, body, device.ObjSk, "manifest")
			if err != nil {
				t.Fatal(err)
			}
			previous, err := cr.ObjectHash(m.ManifestHeaderCodec, first, "manifest")
			if err != nil {
				t.Fatal(err)
			}
			nextFiles := files
			if scenario == "advance" {
				nextFiles = m.Files{Entries: []m.FileEntry{{FileId: bytes.Repeat([]byte{7}, 32), Version: 1, Epoch: 1, State: 2, BlobHash: make([]byte, 32), Name: []byte{}}}}
				body.FilesHash = cr.H("files", m.FilesCodec.Write(nextFiles))
			}
			body.Seq = 2
			body.Op = 1
			body.Prev = previous
			second, err := cr.SignObject(m.ManifestHeaderCodec, body, device.ObjSk, "manifest")
			if err != nil {
				t.Fatal(err)
			}
			checkpoint, head := first, first
			headers := []b.Signed[m.ManifestHeader]{first}
			switch scenario {
			case "rollback":
				checkpoint = second
				headers = append(headers, second)
			case "fork":
				body = first.Body
				body.CreatedAt++
				head, err = cr.SignObject(m.ManifestHeaderCodec, body, device.ObjSk, "manifest")
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
					hello, err := requests.BuildHello(p.ServerHello{Challenge: challenge, Host: req.URL.Hostname(), ServerSignPub: server.ObjPub, AppVersion: "999.0.0", MinClient: "0.0.0", Protocols: []int{1}}, server.ObjSk)
					if err != nil {
						t.Fatal(err)
					}
					raw, err = json.Marshal(p.HelloResponse{Hello: client.Text(b.SignedCodec(p.ServerHelloCodec).Write(hello))})
					if err != nil {
						t.Fatal(err)
					}
				case "/v1/head":
					raw = b.SignedCodec(m.ManifestHeaderCodec).Write(head)
				case "/v1/files/" + client.Text(body.FilesHash):
					raw = m.FilesCodec.Write(nextFiles)
				default:
					t.Fatalf("unexpected request %s", req.URL.Path)
				}
				return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(bytes.NewReader(raw))}, nil
			}
			sc := &sm.Context{Context: context.Background(), Adapters: contracts.Adapters{Home: t.TempDir(), Now: clock}, Options: sm.Options{Now: clock}, State: state.EmptyState("fixture"), VaultID: genesis.VaultID, Identity: ident, Checkpoint: chain.Checkpoint{Header: checkpoint, Files: files, State: verified.State, IdKey: genesis.IDKey}, Headers: headers, Entries: entries, Keys: map[int][]byte{1: genesis.EpochKey}, Client: client.CreateClient(client.Options{Address: "https://fixture.invalid", Pin: pin, VaultID: genesis.VaultID, Identity: ident, Version: "999.0.0", Now: clock, Fetcher: fetch})}
			history := vault.History{Entries: entries, Headers: append([]b.Signed[m.ManifestHeader]{}, head), State: verified.State}
			if scenario == "advance" {
				history.Headers = []b.Signed[m.ManifestHeader]{first, second}
			}
			_, err = AcceptHead(sc, &history, false)
			if scenario == "rollback" {
				if !e.Is(err, e.Rollback) {
					t.Fatal(err)
				}
				return
			}
			if scenario == "fork" {
				if !e.Is(err, e.Fork) {
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
