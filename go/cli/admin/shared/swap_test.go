package shared

import (
	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/chain/devices"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"testing"
)

func TestAdminSwap(t *testing.T) {
	k, err := keys.GenerateDeviceKeys()
	if err != nil {
		t.Fatal(err)
	}
	id, err := keys.DeviceID(k.EncPub, k.ObjPub, k.ReqPub)
	if err != nil {
		t.Fatal(err)
	}
	ident := identity.Identity{Keys: identity.SecretKeys{ObjSk: k.ObjSk}}
	ident.Record.Id = id
	before, err := crypto.SignObject(m.ManifestHeaderCodec, m.ManifestHeader{VaultId: make([]byte, 32), Seq: 7, Prev: make([]byte, 32), ListSeq: 4, ListHead: make([]byte, 32), Epoch: 2, KeyringHash: make([]byte, 32), FilesHash: make([]byte, 32), EnvelopeHash: make([]byte, 32), Signer: id}, k.ObjSk, "manifest")
	if err != nil {
		t.Fatal(err)
	}
	h := History{Headers: []b.Signed[m.ManifestHeader]{before}, State: &devices.State{}}
	entry, err := crypto.SignObject(c.EntryCodec, c.Entry{VaultId: make([]byte, 32), Seq: 5, Parent: make([]byte, 32), EntryPayload: c.EntryPayload{Kind: 7, Payload: p.RenameDevice{Device: id, Name: "renamed"}}, Signer: id}, k.ObjSk, "entry")
	if err != nil {
		t.Fatal(err)
	}
	box := []byte("box")
	swap, err := AdminSwap(h, ident, 13, 123, m.Swap{Entries: []b.Signed[c.Entry]{entry}, Envelope: &box})
	if err != nil {
		t.Fatal(err)
	}
	got := swap.Header.Body
	if got.Seq != 8 || got.Epoch != 2 || got.ListSeq != 5 || got.Op != 13 || got.CreatedAt != 123 || !b.Equal(got.Prev, HeaderHash(before)) || !b.Equal(got.ListHead, EntryHash(entry)) || !b.Equal(got.EnvelopeHash, crypto.H("envelope-blob", box)) {
		t.Fatal(got)
	}
	verified, err := crypto.VerifyObject(m.ManifestHeaderCodec, swap.Header, k.ObjPub, "manifest")
	if err != nil || !verified.OK {
		t.Fatal(verified, err)
	}
	raw, err := b.Encode(m.SwapCodec, swap)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := b.Decode(m.SwapCodec, raw)
	if err != nil || !b.Equal(HeaderHash(decoded.Header), HeaderHash(swap.Header)) {
		t.Fatal(decoded, err)
	}
}

func TestFloor(t *testing.T) {
	signed := b.Signed[m.ManifestHeader]{Body: m.ManifestHeader{VaultId: make([]byte, 32), Seq: 1, Prev: make([]byte, 32), ListHead: make([]byte, 32), KeyringHash: make([]byte, 32), FilesHash: make([]byte, 32), EnvelopeHash: make([]byte, 32), Signer: make([]byte, 16)}, Signature: make([]byte, 64)}
	raw, err := b.Encode(b.SignedCodec(m.ManifestHeaderCodec), signed)
	if err != nil {
		t.Fatal(err)
	}
	local := &model.State{Headers: []string{client.Text(raw)}}
	if err = CheckFloor(local, History{Headers: []b.Signed[m.ManifestHeader]{signed}}); err != nil {
		t.Fatal(err)
	}
	if err = CheckFloor(local, History{}); err == nil {
		t.Fatal("missing floor accepted")
	}
	other := signed
	other.Body.CreatedAt = 1
	if err = CheckFloor(local, History{Headers: []b.Signed[m.ManifestHeader]{other}}); err == nil {
		t.Fatal("fork accepted")
	}
}
