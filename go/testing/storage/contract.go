package storage

import (
	"errors"
	a "github.com/notsuhas/envden/go/core/adapters"
	"reflect"
	"testing"
)

type Fixture struct {
	Storage a.Storage
	Reopen  func() a.Storage
	Dispose func()
}

func b(n int) []byte { return []byte{byte(n)} }

func swap(n int) a.StoredSwap {
	return a.StoredSwap{Header: a.StoredHeader{StoredObject: a.StoredObject{Hash: b(n), Bytes: b(n + 10)}, Seq: uint64(n)}, BodyDigest: b(n + 20), Vault: &a.StoredVault{Active: true}}
}

func value[T any](v T, err error) T {
	if err != nil {
		panic(err)
	}
	return v
}

func must(err error) {
	if err != nil {
		panic(err)
	}
}

func equal(t *testing.T, got, want any) {
	t.Helper()
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("got %#v, want %#v", got, want)
	}
}

func StorageContract(t *testing.T, factory func(*testing.T) Fixture) {
	check := func(name string, fn func(*testing.T, a.Storage, Fixture)) {
		t.Run(name, func(t *testing.T) {
			f := factory(t)
			if f.Dispose != nil {
				defer f.Dispose()
			}
			fn(t, f.Storage, f)
		})
	}
	check("creation, token consumption and digest retries", func(t *testing.T, db a.Storage, _ Fixture) {
		must(db.SetSetupToken(b(90)))
		first := swap(1)
		first.SetupTokenHash = b(90)
		equal(t, value(db.CommitSwap(b(1), nil, first, 0)).Kind, a.Committed)
		equal(t, value(db.SetupToken()), []byte(nil))
		equal(t, value(db.FindCommitted(b(1), first.BodyDigest)), true)
		equal(t, value(db.FindCommitted(b(1), b(100))), false)
		equal(t, value(db.VaultIDs()), [][]byte{b(1)})
		equal(t, value(db.CommitSwap(b(1), nil, first, 1)).Kind, a.RetryOfCommitted)
		equal(t, value(db.CommitSwap(b(1), nil, swap(2), 1)).Kind, a.HeadMovedResult)
	})
	check("uncommitted blobs expire and obey quota", func(t *testing.T, db a.Storage, _ Fixture) { BlobStagingContract(t, db) })
	check("discard removes inactive imports and refuses active vaults", func(t *testing.T, db a.Storage, _ Fixture) {
		s := swap(1)
		s.Vault.Active = false
		s.State = []a.StateWrite{{Kind: a.StateMoveSession, Key: b(0), Bytes: b(4)}}
		value(db.CommitSwap(b(1), nil, s, 0))
		key := a.SessionKey{Kind: a.SessionLogin, Device: b(2), Purpose: "registration"}
		must(db.PutSession(b(1), key, b(5), 0))
		must(db.PutDevice(b(1), b(2), a.StoredDevice{ClientVersion: "1.0.0"}))
		must(db.DiscardInactiveVault(b(1)))
		equal(t, value(db.HasVault(b(1))), false)
		equal(t, value(db.Head(b(1))), []byte(nil))
		equal(t, value(db.State(b(1), a.StateMoveSession, b(0))), []byte(nil))
		equal(t, value(db.Session(b(1), key, 0)), []byte(nil))
		equal(t, value(db.Device(b(1), b(2))), (*a.StoredDevice)(nil))
		equal(t, value(db.CommitSwap(b(1), nil, swap(1), 0)).Kind, a.Committed)
		if db.DiscardInactiveVault(b(1)) == nil {
			t.Fatal("discard active vault succeeded")
		}
	})
	check("chain, credentials and devices survive reopening", func(t *testing.T, db a.Storage, f Fixture) {
		s := swap(1)
		s.Entries = []a.StoredHeader{{StoredObject: a.StoredObject{Hash: b(40), Bytes: b(41)}}}
		s.Files = &a.StoredFiles{StoredObject: a.StoredObject{Hash: b(50), Bytes: b(51)}}
		for _, kind := range []a.StateKind{a.StateKeyring, a.StateEnvelope, a.StateSKPub, a.StateOpaqueRecord} {
			s.State = append(s.State, a.StateWrite{Kind: kind, Key: b(0), Bytes: b(60)})
		}
		s.Devices = []a.StoredDeviceState{{ID: b(3), State: a.StoredDevice{UnlockedUntil: 100, FreshUntil: 50, ClientVersion: "1.0.0"}}}
		value(db.CommitSwap(b(1), nil, s, 0))
		next := f.Reopen()
		equal(t, value(next.Head(b(1))), b(1))
		equal(t, value(next.Headers(b(1), 0, 2, 0, 0)), []a.StoredHeader{s.Header})
		must(next.CapUnlocks(b(1), 70))
		must(next.CapUnlocks(b(1), 90))
		equal(t, value(next.Device(b(1), b(3))).UnlockedUntil, int64(70))
		equal(t, value(next.Header(b(1), b(1))), &s.Header)
		equal(t, value(next.Entries(b(1), 0, 1, 0, 0)), s.Entries)
		equal(t, value(next.FileList(b(1), b(50))), b(51))
		equal(t, value(next.State(b(1), a.StateOpaqueRecord, b(0))), b(60))
		equal(t, value(next.Head(b(2))), []byte(nil))
	})
	check("failed commits roll back all state", func(t *testing.T, db a.Storage, _ Fixture) {
		must(db.ConfigureVault(b(1), a.StoredVault{Active: true}, nil, nil))
		key := a.SessionKey{Kind: a.SessionLogin, Device: b(2), Purpose: "finish"}
		must(db.PutSession(b(1), key, b(9), 0))
		value(db.CommitSwap(b(1), nil, swap(1), 0))
		invalid := swap(2)
		invalid.Header = swap(1).Header
		invalid.ConsumeSessions = []a.SessionKey{key}
		invalid.Vault.Frozen = true
		if _, err := db.CommitSwap(b(1), b(1), invalid, 1); err == nil {
			t.Fatal("duplicate header committed")
		}
		equal(t, value(db.Session(b(1), key, 1)), b(9))
		equal(t, value(db.Vault(b(1))).Frozen, false)
		equal(t, value(db.Head(b(1))), b(1))
	})
	check("move and repair state survive reopening", func(t *testing.T, db a.Storage, f Fixture) {
		must(db.SetSetupToken(b(8)))
		must(db.ConfigureVault(b(1), a.StoredVault{Frozen: true, ServerMoved: b(7), SKRefused: true, Restored: &a.StoredRestored{RepairTokenHash: b(6), RestoredHead: b(5), FinishProgress: b(4)}}, []a.StateWrite{{Kind: a.StateMoveSession, Key: b(1), Bytes: b(3)}, {Kind: a.StateRepairReport, Key: b(2), Bytes: b(2)}}, b(8)))
		next := f.Reopen()
		equal(t, value(next.Vault(b(1))).Restored.FinishProgress, b(4))
		equal(t, len(value(next.States(b(1), a.StateMoveSession))), 1)
		s := swap(1)
		s.ClearRepairReports = true
		value(next.CommitSwap(b(1), nil, s, 0))
		equal(t, value(next.Vault(b(1))).Restored, (*a.StoredRestored)(nil))
		equal(t, len(value(next.States(b(1), a.StateRepairReport))), 0)
	})
	accessContract(t, check)
	check("blob hashes, vault isolation and conflicts", func(t *testing.T, db a.Storage, _ Fixture) {
		must(db.PutBlob(b(1), b(2), b(3), nil, 0, 0))
		equal(t, value(db.GetBlob(b(1), b(2))), b(3))
		equal(t, value(db.GetBlob(b(2), b(2))), []byte(nil))
		if db.PutBlob(b(1), b(2), b(4), nil, 0, 0) == nil {
			t.Fatal("conflicting blob accepted")
		}
		if db.PutBlob(b(1), b(5), b(4), func([]byte) ([]byte, error) { return b(6), nil }, 0, 0) == nil {
			t.Fatal("wrong hash accepted")
		}
		equal(t, value(db.BlobHashes(b(1))), [][]byte{b(2)})
	})
	check("history retains versions and repair material", func(t *testing.T, db a.Storage, _ Fixture) {
		for i := 1; i <= 6; i++ {
			must(db.PutBlob(b(1), b(100+i), b(i), nil, 0, 0))
			s := swap(i)
			hash := b(100 + i)
			if i == 2 {
				hash = nil
			}
			s.Files = &a.StoredFiles{StoredObject: a.StoredObject{Hash: b(50 + i), Bytes: b(i)}, RetainForever: i == 4, Versions: []a.FileVersion{{FileID: b(1), Version: uint64(i), Tombstone: i == 2, BlobHash: hash}}}
			var expected []byte
			if i > 1 {
				expected = b(i - 1)
			}
			value(db.CommitSwap(b(1), expected, s, int64(i)))
		}
		equal(t, value(db.Prune(b(1), a.HistoryPolicy{MaxAge: 1, MinVersions: 1}, 7)), a.PruneResult{Lists: 3, Blobs: 4})
		for _, i := range []int{1, 2, 5} {
			equal(t, value(db.FileList(b(1), b(50+i))), []byte(nil))
		}
		for _, i := range []int{3, 4, 6} {
			if value(db.FileList(b(1), b(50+i))) == nil {
				t.Fatal("retained list missing")
			}
		}
		equal(t, value(db.GetBlob(b(1), b(106))), b(6))
		equal(t, len(value(db.Headers(b(1), 1, 6, 0, 0))), 6)
	})
	check("nested transaction rollback", func(t *testing.T, db a.Storage, _ Fixture) {
		must(db.Transaction(func() error {
			must(db.SetSetupToken(b(1)))
			err := db.Transaction(func() error { must(db.SetSetupToken(b(2))); return errors.New("rollback") })
			if err == nil {
				t.Fatal("inner transaction succeeded")
			}
			equal(t, value(db.SetupToken()), b(1))
			return nil
		}))
		equal(t, value(db.SetupToken()), b(1))
	})
}
