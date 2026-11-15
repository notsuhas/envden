package sqlite

import (
	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	"testing"
)

func b(n int) []byte { return []byte{byte(n)} }

func storedSwap(n int, versions []a.FileVersion) a.StoredSwap {
	return a.StoredSwap{Header: a.StoredHeader{StoredObject: a.StoredObject{Hash: b(n + 10), Bytes: b(n + 10)}, Seq: uint64(n)}, BodyDigest: b(n + 10), Vault: &a.StoredVault{Active: true}, Files: &a.StoredFiles{StoredObject: a.StoredObject{Hash: b(n + 20), Bytes: []byte{1, 1, 1, 1, 1, 1, 1, 1}}, Versions: versions}}
}

func TestQuotaRollbackAndDeletion(t *testing.T) {
	db := open(t, t.TempDir())
	v := b(1)
	for i := 1; i <= 3; i++ {
		check(t, db.PutBlob(v, b(i), b(i), nil, 0, 0))
	}
	live := func(i int) a.FileVersion { return a.FileVersion{FileID: b(i), Version: 1, BlobHash: b(i)} }
	_, err := db.CommitSwap(v, nil, storedSwap(1, []a.FileVersion{live(1), live(2)}), 0)
	check(t, err)
	db.run("UPDATE blob_usage SET size=1073741825 WHERE hash=?", b(1))
	_, err = db.CommitSwap(v, b(11), storedSwap(2, []a.FileVersion{live(1), {FileID: b(2), Version: 2, Tombstone: true}}), 0)
	check(t, err)
	_, err = db.CommitSwap(v, b(12), storedSwap(3, []a.FileVersion{live(1), live(3)}), 0)
	if !e.Is(err, "STORAGE_QUOTA") {
		t.Fatal(err)
	}
	head, err := db.Head(v)
	check(t, err)
	if string(head) != string(b(12)) {
		t.Fatal("head changed after quota failure")
	}
}

func TestSwapQuotaRollsBackCreation(t *testing.T) {
	db := open(t, t.TempDir())
	check(t, db.PutBlob(b(1), b(2), b(3), nil, 0, 0))
	db.run("UPDATE blob_usage SET size=1073741824")
	_, err := db.CommitSwap(b(1), nil, storedSwap(1, nil), 0)
	if !e.Is(err, "STORAGE_QUOTA") {
		t.Fatal(err)
	}
	exists, err := db.HasVault(b(1))
	check(t, err)
	if exists {
		t.Fatal("creation survived failed commit")
	}
}

func TestOverQuotaOperations(t *testing.T) {
	for _, op := range []string{"remove", "rotate", "files", "blob", "move", "repair"} {
		t.Run(op, func(t *testing.T) {
			db := open(t, t.TempDir())
			v := b(1)
			state := a.StoredVault{Active: true}
			check(t, db.ConfigureVault(v, state, nil, nil))
			check(t, db.PutBlob(v, b(2), b(3), nil, 0, 0))
			db.run("UPDATE blob_usage SET size=1073741825")
			imported := op == "move" || op == "repair"
			if imported {
				state.Active = op != "move"
				if op == "repair" {
					state.Restored = &a.StoredRestored{RepairTokenHash: b(2), RestoredHead: b(2)}
				}
				check(t, db.ConfigureVault(v, state, nil, nil))
			}
			s := storedSwap(1, nil)
			s.Vault = nil
			if op != "files" && !imported {
				s.Files = nil
			}
			if op == "rotate" {
				s.State = []a.StateWrite{{Kind: a.StateKeyring, Key: b(2), Bytes: b(2)}}
			}
			if op == "remove" {
				s.Devices = []a.StoredDeviceState{{ID: b(2), State: a.StoredDevice{ClientVersion: "1.0.0"}}}
			}
			if op == "blob" {
				if err := db.PutBlob(v, b(3), b(2), nil, 0, 0); !e.Is(err, "STORAGE_QUOTA") {
					t.Fatal(err)
				}
				return
			}
			_, err := db.CommitSwap(v, nil, s, 0)
			if op == "files" {
				if !e.Is(err, "STORAGE_QUOTA") {
					t.Fatal(err)
				}
				return
			}
			check(t, err)
			if imported {
				check(t, db.PutFileList(v, a.StoredFiles{StoredObject: a.StoredObject{Hash: b(4), Bytes: b(2)}}, 0))
				check(t, db.PutBlob(v, b(5), b(2), nil, 0, 0))
			}
			check(t, db.PutBlob(v, b(2), b(3), nil, 0, 0))
		})
	}
}

func TestRateCleanup(t *testing.T) {
	for _, refund := range []bool{false, true} {
		db := open(t, t.TempDir())
		receipt := ""
		for i := 0; i < 5; i++ {
			r, err := db.Charge(b(1), a.RateBucket{Kind: "non-member"}, 0)
			check(t, err)
			receipt = r.Receipt
		}
		now := int64(30 * 86400000)
		if refund {
			_, err := db.Refund(receipt, 1)
			check(t, err)
			now = 900001
		}
		for i := 0; i < 5; i++ {
			_, err := db.Charge(b(1), a.RateBucket{Kind: "non-member"}, now)
			check(t, err)
		}
		r, err := db.Charge(b(1), a.RateBucket{Kind: "non-member"}, now)
		check(t, err)
		if r.Kind != "locked" || r.Until != now+900000 {
			t.Fatal(r)
		}
	}
	db := open(t, t.TempDir())
	for i := 0; i < 100; i++ {
		for j := 0; j < 20; j++ {
			_, err := db.Charge(b(i), a.RateBucket{Kind: "mailbox", Device: b(i)}, 0)
			check(t, err)
		}
	}
	_, err := db.Charge(b(255), a.RateBucket{Kind: "mailbox"}, 30*86400000)
	check(t, err)
	if db.count("SELECT COUNT(*) FROM charges") != 1 || db.count("SELECT COUNT(*) FROM buckets") != 0 {
		t.Fatal("expired charges or buckets retained")
	}
}
