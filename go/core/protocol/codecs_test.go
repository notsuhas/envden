package protocol_test

import (
	"bytes"
	"testing"

	enverrors "github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/core/protocol/codecs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/content"
	"github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	"github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	"github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	coreprotocolcodecsmembers "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	"github.com/notsuhas/envden/go/core/protocol/codecs/pairing"
	wire "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	"github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/crypto/objects"
	"github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

func round[T any](t *testing.T, codec encoding.Codec[T], v T) {
	t.Helper()
	raw := must(encoding.Encode(codec, v))
	eq(t, must(encoding.Decode(codec, raw)), v)
	_, err := encoding.Decode(codec, encoding.Concat(raw, []byte{0}))
	reject(t, err)
	for i := range raw {
		_, err = encoding.Decode(codec, raw[:i])
		reject(t, err)
	}
}

func fixtures() (coreprotocolcodecsmembers.DeviceRecord, coreprotocolcodecsmembers.RecoveryRecord, epochs.Wrap, epochs.EpochChange, manifests.ManifestHeader) {
	k := must(keys.GenerateDeviceKeys(rng))
	id := must(keys.DeviceID(k.EncPub, k.ObjPub, k.ReqPub))
	z := make([]byte, 32)
	device := coreprotocolcodecsmembers.DeviceRecord{Id: id, Name: "test", EncPub: k.EncPub, ObjPub: k.ObjPub, ReqPub: k.ReqPub}
	rec := coreprotocolcodecsmembers.RecoveryRecord{Id: must(keys.RecoveryID(k.EncPub, k.ObjPub)), EncPub: k.EncPub, ObjPub: k.ObjPub}
	wrap := epochs.Wrap{Recipient: id, Enc: z, Ct: make([]byte, 48)}
	change := epochs.EpochChange{Epoch: 1, KeyCommit: z, Wraps: []epochs.Wrap{wrap}}
	manifest := manifests.ManifestHeader{VaultId: z, Seq: 1, Op: 0, Prev: z, ListSeq: 1, ListHead: z, Epoch: 1, KeyringHash: z, FilesHash: z, EnvelopeHash: z, CreatedAt: 1, Signer: id}

	return device, rec, wrap, change, manifest
}

func TestCodecRoundTrips(t *testing.T) {
	d, r, w, ch, m := fixtures()
	z := make([]byte, 32)
	variants := []any{entrypayloads.Genesis{ServerPin: z, Device: d, Recovery: r, VaultNonce: z, CreatedAt: 1}, entrypayloads.AddDevice{Device: d, Wrap: w}, entrypayloads.RemoveDevice{Device: d.Id, NewRecovery: &r, Change: ch}, entrypayloads.NewEpoch{Change: ch}, entrypayloads.ReplaceRecovery{Recovery: r, Change: ch}, entrypayloads.ServerMoved{OldPin: z, NewPin: z, NewAddress: "server.example"}, entrypayloads.RepairDone{RepairId: z, RestoredHead: z}, entrypayloads.RenameDevice{Device: d.Id, Name: "laptop"}}
	for kind, payload := range variants {
		v := codecs.Entry{VaultId: z, Parent: z, EntryPayload: codecs.EntryPayload{Kind: kind, Payload: payload}, Signer: d.Id}
		round(t, codecs.EntryCodec, v)
		raw := must(encoding.Encode(codecs.EntryCodec, v))
		for offset, value := range map[int]byte{0: 255, 1: 2, 74: 8} {
			bad := bytes.Clone(raw)
			bad[offset] = value
			_, err := encoding.Decode(codecs.EntryCodec, bad)
			if !enverrors.Is(err, enverrors.UpdateRequired) {
				t.Fatalf("expected update required at %d: %v", offset, err)
			}
		}
	}
	round(t, coreprotocolcodecsmembers.DeviceRecordCodec, d)
	round(t, coreprotocolcodecsmembers.RecoveryRecordCodec, r)
	round(t, epochs.WrapCodec, w)
	round(t, epochs.EpochChangeCodec, ch)
	round(t, manifests.ManifestHeaderCodec, m)
	round(t, pairing.PairJoinerCodec, pairing.PairJoiner{Device: d})
	round(t, pairing.PairApproverCodec, pairing.PairApprover{VaultId: z, ServerPin: z, ManifestHash: z})
	round(t, wire.RepairReportCodec, wire.RepairReport{VaultId: z, RepairId: z, Head: z, Blobs: [][]byte{z}, Signer: d.Id})
	round(t, content.EnvelopeCodec, content.Envelope{VaultId: z, RecoveryEncSk: z, RecoveryObjSk: z, Checkpoint: z, SealedAt: 1})
	round(t, content.FileCodec, content.File{RepoId: "repo", Path: "a", Content: []byte{1}})
	round(t, content.FileNameCodec, content.FileName{RepoId: "repo", Path: "a"})
	round(t, wire.RequestCodec, request(t))
	round(t, wire.ServerHelloCodec, wire.ServerHello{Challenge: z, Host: "server", ServerSignPub: d.ObjPub, AppVersion: "1.0.0", MinClient: "1.0.0", Protocols: []int{1}})
	round(t, epochs.KeyringCodec, epochs.Keyring{VaultId: z, Epoch: 2, IdKey: z, Older: []epochs.OlderKey{{Epoch: 1, Key: z}}})
	hash := bytes.Clone(z)
	hash[0] = 1
	f := manifests.Files{Entries: []manifests.FileEntry{{FileId: z, Version: 1, Epoch: 1, State: 1, BlobHash: hash, Name: z}}}
	round(t, manifests.FilesCodec, f)
	signed := must(crypto.SignObject(manifests.ManifestHeaderCodec, m, rng(32), "manifest"))
	swap := manifests.Swap{ExpectedHead: z, Entries: []encoding.Signed[codecs.Entry]{}, Header: signed}
	round(t, manifests.SwapCodec, swap)
	swap.Files = &f
	swap.Keyring = &z
	swap.Envelope = &z
	swap.SkPub = &z
	swap.OpaqueRecord = &z
	swap.Approver = &z
	round(t, manifests.SwapCodec, swap)
}

func TestCodecSemantics(t *testing.T) {
	d, r, w, ch, m := fixtures()
	z := make([]byte, 32)
	invalid := d
	invalid.Id = make([]byte, 16)
	_, err := encoding.Encode(coreprotocolcodecsmembers.DeviceRecordCodec, invalid)
	reject(t, err)
	for _, name := range []string{"", string(bytes.Repeat([]byte{'a'}, 65)), "laptop\u200b", "\u202elaptop"} {
		v := d
		v.Name = name
		_, err = encoding.Encode(coreprotocolcodecsmembers.DeviceRecordCodec, v)
		reject(t, err)
		_, err = encoding.Encode(entrypayloads.RenameDeviceCodec, entrypayloads.RenameDevice{Device: d.Id, Name: name})
		reject(t, err)
	}
	r.Id = make([]byte, 16)
	_, err = encoding.Encode(coreprotocolcodecsmembers.RecoveryRecordCodec, r)
	reject(t, err)
	w.Ct = z
	_, err = encoding.Encode(epochs.WrapCodec, w)
	reject(t, err)
	ch.Wraps = append(ch.Wraps, ch.Wraps[0])
	_, err = encoding.Encode(epochs.EpochChangeCodec, ch)
	reject(t, err)
	m.Op = 14
	_, err = encoding.Encode(manifests.ManifestHeaderCodec, m)
	if !enverrors.Is(err, enverrors.UpdateRequired) {
		t.Fatal(err)
	}
	m.Op = 0
	raw := must(encoding.Encode(manifests.ManifestHeaderCodec, m))
	raw[42] = 14
	_, err = encoding.Decode(manifests.ManifestHeaderCodec, raw)
	if !enverrors.Is(err, enverrors.UpdateRequired) {
		t.Fatal(err)
	}
	_, err = encoding.Encode(epochs.KeyringCodec, epochs.Keyring{VaultId: z, Epoch: 3, IdKey: z, Older: []epochs.OlderKey{{Epoch: 2, Key: z}}})
	reject(t, err)
	for _, state := range []int{0, 1, 3, 5} {
		_, err = encoding.Encode(manifests.FileEntryCodec, manifests.FileEntry{FileId: z, Version: 1, Epoch: 1, State: state, BlobHash: z, Name: z})
		reject(t, err)
	}
	_, err = encoding.Encode(manifests.FileEntryCodec, manifests.FileEntry{FileId: z, Version: 1, Epoch: 1, State: 2, BlobHash: bytes.Repeat([]byte{1}, 32), Name: z})
	reject(t, err)
	_, err = encoding.Encode(content.FileCodec, content.File{RepoId: "repo", Path: "a", Content: make([]byte, 1048577)})
	reject(t, err)
}

func TestMemberKeyRejections(t *testing.T) {
	d, r, _, _, _ := fixtures()
	high := bytes.Clone(d.EncPub)
	high[31] |= 128
	over := bytes.Repeat([]byte{255}, 32)
	over[0] = 246
	over[31] = 127
	one := make([]byte, 32)
	one[0] = 1
	for _, pub := range [][]byte{high, over, make([]byte, 32), one, from("e0eb7a7c3b41b8ae1656e3faf19fc46ada098deb9c32b1fd866205165f49b800")} {
		v := d
		v.EncPub = pub
		v.Id = must(keys.DeviceID(pub, v.ObjPub, v.ReqPub))
		_, err := encoding.Encode(coreprotocolcodecsmembers.DeviceRecordCodec, v)
		reject(t, err)
		rec := r
		rec.EncPub = pub
		rec.Id = must(keys.RecoveryID(pub, rec.ObjPub))
		_, err = encoding.Encode(coreprotocolcodecsmembers.RecoveryRecordCodec, rec)
		reject(t, err)
		raw := must(encoding.Encode(coreprotocolcodecsmembers.DeviceRecordCodec, d))
		copy(raw, v.Id)
		copy(raw[16+len(encoding.Str.Write(d.Name)):], pub)
		_, err = encoding.Decode(coreprotocolcodecsmembers.DeviceRecordCodec, raw)
		reject(t, err)
		_, err = encoding.Decode(coreprotocolcodecsmembers.RecoveryRecordCodec, encoding.Concat(rec.Id, pub, rec.ObjPub))
		reject(t, err)
	}
}

func TestRawSignedObjects(t *testing.T) {
	d, _, _, _, m := fixtures()
	v := must(crypto.SignObject(manifests.ManifestHeaderCodec, m, rng(32), "manifest"))
	raw := must(encoding.Encode(encoding.SignedCodec(manifests.ManifestHeaderCodec), v))
	members := []objects.Member{{Id: d.Id, ObjPub: d.ObjPub}}
	eq(t, objects.VerifyRawObject(raw, members, "manifest").OK, true)
	eq(t, objects.VerifyRawObject(raw, nil, "manifest").Reason, "Unknown signer")
	eq(t, objects.VerifyRawObject(raw[:81], members, "manifest").Reason, "Truncated signed object")
	eq(t, objects.VerifyRawObject(raw, members, "entry").OK, false)
}
