package notice

import (
	"bytes"
	"testing"

	"github.com/notsuhas/envden/go/cli/client"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
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

	makeDevice := func(name string) members.DeviceRecord {
		k, err := keys.GenerateDeviceKeys()
		if err != nil {
			t.Fatal(err)
		}

		id, err := keys.DeviceID(k.EncPub, k.ObjPub, k.ReqPub)
		if err != nil {
			t.Fatal(err)
		}

		return members.DeviceRecord{Id: id, Name: name, EncPub: k.EncPub, ObjPub: k.ObjPub, ReqPub: k.ReqPub}
	}
	first, second, third := makeDevice("first"), makeDevice("second"), makeDevice("third")
	genesis := codecs.Entry{VaultId: make([]byte, 32), Parent: make([]byte, 32), Signer: first.Id, EntryPayload: codecs.EntryPayload{Kind: 0, Payload: entrypayloads.Genesis{ServerPin: make([]byte, 32), VaultNonce: make([]byte, 32), Device: first, Recovery: members.RecoveryRecord{Id: recoveryID, EncPub: recovery.EncPub, ObjPub: recovery.ObjPub}}}}
	entries := []string{}
	appendEntry := func(entry codecs.Entry) {
		signed, err := crypto.SignObject(codecs.EntryCodec, entry, recovery.ObjSk, "entry")
		if err != nil {
			t.Fatal(err)
		}

		entries = append(entries, client.Text(encoding.SignedCodec(codecs.EntryCodec).Write(signed)))
	}
	appendEntry(genesis)
	for i, d := range []members.DeviceRecord{second, third} {
		appendEntry(codecs.Entry{VaultId: make([]byte, 32), Seq: uint64(i + 2), Parent: make([]byte, 32), Signer: recoveryID, EntryPayload: codecs.EntryPayload{Kind: 1, Payload: entrypayloads.AddDevice{Device: d, Wrap: epochs.Wrap{Recipient: d.Id, Enc: make([]byte, 32), Ct: make([]byte, 48)}}}})
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
