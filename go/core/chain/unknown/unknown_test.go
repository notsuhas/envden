package unknown_test

import (
	"bytes"
	"errors"
	"testing"

	u "github.com/notsuhas/envden/go/core/chain/unknown"
	c "github.com/notsuhas/envden/go/core/protocol/codecs"
	cr "github.com/notsuhas/envden/go/core/protocol/crypto"
	"github.com/notsuhas/envden/go/core/protocol/crypto/objects"
	b "github.com/notsuhas/envden/go/core/protocol/encoding"
	"github.com/notsuhas/envden/go/core/protocol/keys"
)

func TestClassificationOrder(t *testing.T) {
	for _, tc := range []struct {
		name, mismatch, want string
		stored               []byte
		verify, unknown      bool
		current              string
		panicVerify          bool
	}{
		{"fork before verification", "fork", "fork", []byte{2}, false, true, "1.0.0", true},
		{"rollback before verification", "rollback", "rollback", []byte{2}, false, true, "1.0.0", true},
		{"matching bytes still verify", "fork", "invalid", []byte{1}, false, true, "1.0.0", true},
		{"bad signature", "fork", "invalid", nil, false, true, "1.0.0", false},
		{"new format", "fork", "update-required", nil, true, true, "1.0.0", false},
		{"current version", "fork", "unreadable", nil, true, true, "2.0.0", false},
		{"known format", "fork", "known", nil, true, false, "1.0.0", false},
	} {
		t.Run(tc.name, func(t *testing.T) {
			calls := 0
			got, err := u.ClassifyUnknownData(u.Input{Received: []byte{1}, Stored: tc.stored, Mismatch: tc.mismatch, UnknownFormat: tc.unknown, CurrentVersion: tc.current, LatestVersion: "2.0.0", Verify: func() (bool, error) {
				calls++
				if tc.panicVerify {
					panic(errors.New("must not run before comparison"))
				}
				return tc.verify, nil
			}})
			if err != nil || got.Kind != tc.want {
				t.Fatalf("got %v, %v", got, err)
			}
			if tc.stored != nil && !bytes.Equal(tc.stored, []byte{1}) && calls != 0 {
				t.Fatal("verified before comparison")
			}
		})
	}
}

func TestUnknownEntryAuthenticatesExactRawBytes(t *testing.T) {
	key := bytes.Repeat([]byte{3}, 32)
	pair := b.Must(keys.GenerateDeviceKeys(func(n int) []byte { return bytes.Repeat([]byte{3}, n) }))
	id := b.Must(keys.DeviceID(pair.EncPub, pair.ObjPub, pair.ReqPub))
	body := b.Concat(b.Header(1), make([]byte, 32), b.U64.Write(2), make([]byte, 32), []byte{99}, id)
	raw := b.Concat(body, b.Must(cr.Sign(key, "entry", body)))
	members := []objects.Member{{Id: id, ObjPub: pair.ObjPub}}
	if !objects.VerifyRawObject(raw, members, "entry").OK {
		t.Fatal("fixture signature")
	}
	bad := bytes.Clone(raw)
	bad[len(bad)-1] ^= 1
	for _, tc := range []struct {
		name, want, latest string
		received, stored   []byte
	}{
		{"future kind", "update-required", "2.0.0", raw, nil},
		{"latest version", "unreadable", "1.0.0", raw, nil},
		{"bad signature", "invalid", "2.0.0", bad, nil},
		{"truncated", "invalid", "2.0.0", raw[:20], nil},
		{"stored mismatch", "fork", "2.0.0", raw, bad},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result, err := u.DecodeServerObject(u.DecodeInput[c.Entry]{Received: tc.received, Stored: tc.stored, Mismatch: "fork", Members: members, Codec: c.EntryCodec, Label: "entry", CurrentVersion: "1.0.0", LatestVersion: tc.latest})
			if err != nil || result.Kind != tc.want {
				t.Fatalf("got %v, %v", result, err)
			}
		})
	}
}
