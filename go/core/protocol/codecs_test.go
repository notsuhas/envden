package protocol_test

import (
	"bytes"
	"testing"

	e "github.com/notsuhas/envden/go/core/errors"
	co "github.com/notsuhas/envden/go/core/protocol/codecs"
	ct "github.com/notsuhas/envden/go/core/protocol/codecs/content"
	p "github.com/notsuhas/envden/go/core/protocol/codecs/entrypayloads"
	ce "github.com/notsuhas/envden/go/core/protocol/codecs/epochs"
	mf "github.com/notsuhas/envden/go/core/protocol/codecs/manifests"
	cm "github.com/notsuhas/envden/go/core/protocol/codecs/members"
	cp "github.com/notsuhas/envden/go/core/protocol/codecs/pairing"
	cs "github.com/notsuhas/envden/go/core/protocol/codecs/server"
	c "github.com/notsuhas/envden/go/core/protocol/crypto"
	objects "github.com/notsuhas/envden/go/core/protocol/crypto/objects"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

func round[T any](t *testing.T, codec b.Codec[T], v T) {
	t.Helper()
	raw := must(b.Encode(codec, v))
	eq(t, must(b.Decode(codec, raw)), v)
	_, err := b.Decode(codec, b.Concat(raw, []byte{0}))
	reject(t, err)
	for i := range raw {
		_, err = b.Decode(codec, raw[:i])
		reject(t, err)
	}
}

func fixtures() (cm.DeviceRecord, cm.RecoveryRecord, ce.Wrap, ce.EpochChange, mf.ManifestHeader) {
	k := must(keys.GenerateDeviceKeys(rng))
	id := must(keys.DeviceID(k.EncPub, k.ObjPub, k.ReqPub))
	z := make([]byte, 32)
	device := cm.DeviceRecord{Id: id, Name: "test", EncPub: k.EncPub, ObjPub: k.ObjPub, ReqPub: k.ReqPub}
	rec := cm.RecoveryRecord{Id: must(keys.RecoveryID(k.EncPub, k.ObjPub)), EncPub: k.EncPub, ObjPub: k.ObjPub}
	wrap := ce.Wrap{Recipient: id, Enc: z, Ct: make([]byte, 48)}
	change := ce.EpochChange{Epoch: 1, KeyCommit: z, Wraps: []ce.Wrap{wrap}}
	manifest := mf.ManifestHeader{VaultId: z, Seq: 1, Op: 0, Prev: z, ListSeq: 1, ListHead: z, Epoch: 1, KeyringHash: z, FilesHash: z, EnvelopeHash: z, CreatedAt: 1, Signer: id}
	return device, rec, wrap, change, manifest
}

func TestCodecRoundTrips(t *testing.T) {
	d, r, w, ch, m := fixtures()
	z := make([]byte, 32)
	variants := []any{p.Genesis{ServerPin: z, Device: d, Recovery: r, VaultNonce: z, CreatedAt: 1}, p.AddDevice{Device: d, Wrap: w}, p.RemoveDevice{Device: d.Id, NewRecovery: &r, Change: ch}, p.NewEpoch{Change: ch}, p.ReplaceRecovery{Recovery: r, Change: ch}, p.ServerMoved{OldPin: z, NewPin: z, NewAddress: "server.example"}, p.RepairDone{RepairId: z, RestoredHead: z}, p.RenameDevice{Device: d.Id, Name: "laptop"}}
	for kind, payload := range variants {
		v := co.Entry{VaultId: z, Parent: z, EntryPayload: co.EntryPayload{Kind: kind, Payload: payload}, Signer: d.Id}
		round(t, co.EntryCodec, v)
		raw := must(b.Encode(co.EntryCodec, v))
		for offset, value := range map[int]byte{0: 255, 1: 2, 74: 8} {
			bad := bytes.Clone(raw)
			bad[offset] = value
			_, err := b.Decode(co.EntryCodec, bad)
			if !e.Is(err, e.UpdateRequired) {
				t.Fatalf("expected update required at %d: %v", offset, err)
			}
		}
	}
	round(t, cm.DeviceRecordCodec, d)
	round(t, cm.RecoveryRecordCodec, r)
	round(t, ce.WrapCodec, w)
	round(t, ce.EpochChangeCodec, ch)
	round(t, mf.ManifestHeaderCodec, m)
	round(t, cp.PairJoinerCodec, cp.PairJoiner{Device: d})
	round(t, cp.PairApproverCodec, cp.PairApprover{VaultId: z, ServerPin: z, ManifestHash: z})
	round(t, cs.RepairReportCodec, cs.RepairReport{VaultId: z, RepairId: z, Head: z, Blobs: [][]byte{z}, Signer: d.Id})
	round(t, ct.EnvelopeCodec, ct.Envelope{VaultId: z, RecoveryEncSk: z, RecoveryObjSk: z, Checkpoint: z, SealedAt: 1})
	round(t, ct.FileCodec, ct.File{RepoId: "repo", Path: "a", Content: []byte{1}})
	round(t, ct.FileNameCodec, ct.FileName{RepoId: "repo", Path: "a"})
	round(t, cs.RequestCodec, request(t))
	round(t, cs.ServerHelloCodec, cs.ServerHello{Challenge: z, Host: "server", ServerSignPub: d.ObjPub, AppVersion: "1.0.0", MinClient: "1.0.0", Protocols: []int{1}})
	round(t, ce.KeyringCodec, ce.Keyring{VaultId: z, Epoch: 2, IdKey: z, Older: []ce.OlderKey{{Epoch: 1, Key: z}}})
	hash := bytes.Clone(z)
	hash[0] = 1
	f := mf.Files{Entries: []mf.FileEntry{{FileId: z, Version: 1, Epoch: 1, State: 1, BlobHash: hash, Name: z}}}
	round(t, mf.FilesCodec, f)
	signed := must(c.SignObject(mf.ManifestHeaderCodec, m, rng(32), "manifest"))
	swap := mf.Swap{ExpectedHead: z, Entries: []b.Signed[co.Entry]{}, Header: signed}
	round(t, mf.SwapCodec, swap)
	swap.Files = &f
	swap.Keyring = &z
	swap.Envelope = &z
	swap.SkPub = &z
	swap.OpaqueRecord = &z
	swap.Approver = &z
	round(t, mf.SwapCodec, swap)
}

func TestCodecSemantics(t *testing.T) {
	d, r, w, ch, m := fixtures()
	z := make([]byte, 32)
	invalid := d
	invalid.Id = make([]byte, 16)
	_, err := b.Encode(cm.DeviceRecordCodec, invalid)
	reject(t, err)
	for _, name := range []string{"", string(bytes.Repeat([]byte{'a'}, 65)), "laptop\u200b", "\u202elaptop"} {
		v := d
		v.Name = name
		_, err = b.Encode(cm.DeviceRecordCodec, v)
		reject(t, err)
		_, err = b.Encode(p.RenameDeviceCodec, p.RenameDevice{Device: d.Id, Name: name})
		reject(t, err)
	}
	r.Id = make([]byte, 16)
	_, err = b.Encode(cm.RecoveryRecordCodec, r)
	reject(t, err)
	w.Ct = z
	_, err = b.Encode(ce.WrapCodec, w)
	reject(t, err)
	ch.Wraps = append(ch.Wraps, ch.Wraps[0])
	_, err = b.Encode(ce.EpochChangeCodec, ch)
	reject(t, err)
	m.Op = 14
	_, err = b.Encode(mf.ManifestHeaderCodec, m)
	if !e.Is(err, e.UpdateRequired) {
		t.Fatal(err)
	}
	m.Op = 0
	raw := must(b.Encode(mf.ManifestHeaderCodec, m))
	raw[42] = 14
	_, err = b.Decode(mf.ManifestHeaderCodec, raw)
	if !e.Is(err, e.UpdateRequired) {
		t.Fatal(err)
	}
	_, err = b.Encode(ce.KeyringCodec, ce.Keyring{VaultId: z, Epoch: 3, IdKey: z, Older: []ce.OlderKey{{Epoch: 2, Key: z}}})
	reject(t, err)
	for _, state := range []int{0, 1, 3, 5} {
		_, err = b.Encode(mf.FileEntryCodec, mf.FileEntry{FileId: z, Version: 1, Epoch: 1, State: state, BlobHash: z, Name: z})
		reject(t, err)
	}
	_, err = b.Encode(mf.FileEntryCodec, mf.FileEntry{FileId: z, Version: 1, Epoch: 1, State: 2, BlobHash: bytes.Repeat([]byte{1}, 32), Name: z})
	reject(t, err)
	_, err = b.Encode(ct.FileCodec, ct.File{RepoId: "repo", Path: "a", Content: make([]byte, 1048577)})
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
		_, err := b.Encode(cm.DeviceRecordCodec, v)
		reject(t, err)
		rec := r
		rec.EncPub = pub
		rec.Id = must(keys.RecoveryID(pub, rec.ObjPub))
		_, err = b.Encode(cm.RecoveryRecordCodec, rec)
		reject(t, err)
		raw := must(b.Encode(cm.DeviceRecordCodec, d))
		copy(raw, v.Id)
		copy(raw[16+len(b.Str.Write(d.Name)):], pub)
		_, err = b.Decode(cm.DeviceRecordCodec, raw)
		reject(t, err)
		_, err = b.Decode(cm.RecoveryRecordCodec, b.Concat(rec.Id, pub, rec.ObjPub))
		reject(t, err)
	}
}

func TestRawSignedObjects(t *testing.T) {
	d, _, _, _, m := fixtures()
	v := must(c.SignObject(mf.ManifestHeaderCodec, m, rng(32), "manifest"))
	raw := must(b.Encode(b.SignedCodec(mf.ManifestHeaderCodec), v))
	members := []objects.Member{{Id: d.Id, ObjPub: d.ObjPub}}
	eq(t, objects.VerifyRawObject(raw, members, "manifest").OK, true)
	eq(t, objects.VerifyRawObject(raw, nil, "manifest").Reason, "Unknown signer")
	eq(t, objects.VerifyRawObject(raw[:81], members, "manifest").Reason, "Truncated signed object")
	eq(t, objects.VerifyRawObject(raw, members, "entry").OK, false)
}
