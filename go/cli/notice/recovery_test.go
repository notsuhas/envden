package notice

import (
	"bytes"
	"github.com/notsuhas/envden/go/cli/client"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	e "github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	m "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
	"testing"
)

func TestRecoveryNoticesOnceAndSkipOwnJoin(t *testing.T) {
	recovery, err := keys.GenerateRecoveryKeys()
	if err != nil {
		t.Fatal(err)
	}
	recoveryID, err := keys.RecoveryID(recovery.EncPub, recovery.ObjPub)
	if err != nil {
		t.Fatal(err)
	}
	makeDevice := func(name string) m.DeviceRecord {
		k, err := keys.GenerateDeviceKeys()
		if err != nil {
			t.Fatal(err)
		}
		id, err := keys.DeviceID(k.EncPub, k.ObjPub, k.ReqPub)
		if err != nil {
			t.Fatal(err)
		}
		return m.DeviceRecord{Id: id, Name: name, EncPub: k.EncPub, ObjPub: k.ObjPub, ReqPub: k.ReqPub}
	}
	first, second, third := makeDevice("first"), makeDevice("second"), makeDevice("third")
	genesis := c.Entry{VaultId: make([]byte, 32), Parent: make([]byte, 32), Signer: first.Id, EntryPayload: c.EntryPayload{Kind: 0, Payload: p.Genesis{ServerPin: make([]byte, 32), VaultNonce: make([]byte, 32), Device: first, Recovery: m.RecoveryRecord{Id: recoveryID, EncPub: recovery.EncPub, ObjPub: recovery.ObjPub}}}}
	entries := []string{}
	appendEntry := func(entry c.Entry) {
		signed, err := crypto.SignObject(c.EntryCodec, entry, recovery.ObjSk, "entry")
		if err != nil {
			t.Fatal(err)
		}
		entries = append(entries, client.Text(b.SignedCodec(c.EntryCodec).Write(signed)))
	}
	appendEntry(genesis)
	for i, d := range []m.DeviceRecord{second, third} {
		appendEntry(c.Entry{VaultId: make([]byte, 32), Seq: uint64(i + 2), Parent: make([]byte, 32), Signer: recoveryID, EntryPayload: c.EntryPayload{Kind: 1, Payload: p.AddDevice{Device: d, Wrap: e.Wrap{Recipient: d.Id, Enc: make([]byte, 32), Ct: make([]byte, 48)}}}})
	}
	notices, err := RecoveryJoins(entries, first.Id)
	if err != nil || len(notices) != 2 {
		t.Fatal(notices, err)
	}
	home := t.TempDir()
	now := func() int64 { return 1800000000000 }
	var output bytes.Buffer
	for range 2 {
		if err = PrintRecoveryJoins(home, notices, now, &output); err != nil {
			t.Fatal(err)
		}
	}
	if output.String() != "envden: second joined with the recovery kit\nenvden: third joined with the recovery kit\n" {
		t.Fatal(output.String())
	}
	own, err := RecoveryJoins(entries, second.Id)
	if err != nil || len(own) != 1 || own[0].Value != "third" {
		t.Fatal(own, err)
	}
}
