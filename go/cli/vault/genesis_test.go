package vault

import (
	"bytes"
	"context"
	"github.com/notsuhas/envden/go/cli/identity"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/core/chain/devices"
	p "github.com/notsuhas/envden/go/core/protocol/codecs"
	d "github.com/notsuhas/envden/go/core/protocol/codecs/content"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/envelope"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"github.com/notsuhas/envden/go/testing/keychain"
	"testing"
)

func TestGenesisCreationAndAddition(t *testing.T) {
	now := func() int64 { return 1800000000000 }
	timing := lock.Timing{Now: now}
	memory := keychain.CreateMemoryKeychainAdapter([]string{"get", "set"})
	ident, err := identity.DeviceIdentity(context.Background(), memory, t.TempDir(), "laptop", false, timing)
	if err != nil {
		t.Fatal(err)
	}
	material, err := CreateGenesis(ident, bytes.Repeat([]byte{8}, 32), now())
	if err != nil {
		t.Fatal(err)
	}
	chain, err := devices.VerifyChain([]b.Signed[p.Entry]{material.Genesis, material.Epoch})
	if err != nil || chain.Kind != "valid" {
		t.Fatal(chain, err)
	}
	swap, kit, err := CreateVaultSwap(material, ident, "password", "AQ", now())
	if err != nil {
		t.Fatal(err)
	}
	raw, err := b.Encode(m.SwapCodec, swap)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := b.Decode(m.SwapCodec, raw)
	if err != nil || decoded.Header.Body.Seq != 1 {
		t.Fatal(err)
	}
	secret, err := keys.DecodeSecretKey(kit.SecretKey)
	if err != nil {
		t.Fatal(err)
	}
	opened, err := envelope.OpenEnvelope(*decoded.Envelope, "password", secret, material.VaultID)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(opened.RecoveryEncSk, material.RecoveryKeys.EncSk) || !bytes.Equal(opened.RecoveryObjSk, material.RecoveryKeys.ObjSk) {
		t.Fatal("recovery envelope mismatch")
	}
	if !bytes.Equal(c.H("files", m.FilesCodec.Write(*decoded.Files)), decoded.Header.Body.FilesHash) {
		t.Fatal("files hash mismatch")
	}
	if _, err = b.Decode(d.EnvelopeCodec, d.EnvelopeCodec.Write(opened)); err != nil {
		t.Fatal(err)
	}
	candidate, err := identity.DeviceIdentity(context.Background(), memory, t.TempDir(), "laptop", false, timing)
	if err != nil {
		t.Fatal(err)
	}
	history := History{Entries: swap.Entries, Headers: []b.Signed[m.ManifestHeader]{swap.Header}, State: chain.State}
	named := NamedForList(candidate.Record, history)
	if named.Name != "laptop-2" {
		t.Fatal(named.Name)
	}
	addition, err := AddDeviceSwap(history, named, ident.Record.Id, ident.Keys.ObjSk, material.EpochKey, 2, now(), ident.Record.Id, ident.Keys.ObjSk)
	if err != nil {
		t.Fatal(err)
	}
	applied, err := devices.ApplyEntry(chain.State, addition.Entries[0])
	if err != nil || applied.Kind != "valid" {
		t.Fatal(applied, err)
	}
}
