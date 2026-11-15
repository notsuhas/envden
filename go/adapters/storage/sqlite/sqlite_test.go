package sqlite

import (
	"database/sql"
	"errors"
	a "github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"
)

func check(t *testing.T, err error) {
	t.Helper()
	if err != nil {
		t.Fatal(err)
	}
}

func open(t *testing.T, dir string) *storage {
	t.Helper()
	db, err := CreateSqliteStorageAdapter(dir, 0)
	check(t, err)
	t.Cleanup(func() { db.Close() })
	return db.(*storage)
}

func TestPermissionsAndSchema(t *testing.T) {
	dir := t.TempDir()
	db := open(t, dir)
	check(t, db.Close())
	check(t, os.WriteFile(filepath.Join(dir, "identity.json"), []byte("{}"), 0644))
	check(t, os.Chmod(dir, 0755))
	check(t, os.Chmod(filepath.Join(dir, "envden.sqlite"), 0644))
	db = open(t, dir)
	for _, name := range []string{"", "identity.json", "envden.sqlite", "envden.sqlite-wal", "envden.sqlite-shm"} {
		st, err := os.Stat(filepath.Join(dir, name))
		check(t, err)
		want := os.FileMode(0600)
		if name == "" {
			want = 0700
		}
		if st.Mode().Perm() != want {
			t.Fatal(name, st.Mode())
		}
	}
	if db.count("PRAGMA user_version") != 1 {
		t.Fatal("wrong format")
	}
	for _, index := range []string{"nonces_expires", "sessions_expires", "approvers_expires", "headers_files", "charges_at", "charges_bucket", "buckets_until"} {
		if db.count("SELECT COUNT(*) FROM sqlite_master WHERE name=?", index) != 1 {
			t.Fatal(index)
		}
	}
}

func TestMigrationAndMaintenance(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "envden.sqlite")
	raw, err := sql.Open("sqlite", path)
	check(t, err)
	_, err = raw.Exec("CREATE TABLE fixture(value); INSERT INTO fixture(rowid,value) VALUES(5,42)")
	check(t, err)
	check(t, raw.Close())
	check(t, os.WriteFile(filepath.Join(dir, "pre-1"), []byte("partial"), 0600))
	db := open(t, dir)
	backup, err := sql.Open("sqlite", filepath.Join(dir, "pre-1"))
	check(t, err)
	defer backup.Close()
	var rowid, value int
	check(t, backup.QueryRow("SELECT rowid,value FROM fixture").Scan(&rowid, &value))
	if rowid != 5 || value != 42 {
		t.Fatal(rowid, value)
	}
	check(t, os.Chtimes(filepath.Join(dir, "pre-1"), time.UnixMilli(0), time.UnixMilli(0)))
	key := a.SessionKey{Kind: a.SessionLogin, Device: []byte{1}, Purpose: "unlock"}
	check(t, db.PutSession([]byte{1}, key, []byte{2}, 0))
	db.run("INSERT INTO approvers VALUES(x'01',x'01',x'02',100)")
	_, err = db.RememberNonce([]byte{1}, []byte{2}, 30*86400000)
	check(t, err)
	if _, err = os.Stat(filepath.Join(dir, "pre-1")); !os.IsNotExist(err) {
		t.Fatal("expired backup retained")
	}
	for _, table := range []string{"sessions", "approvers"} {
		if db.count("SELECT COUNT(*) FROM "+table) != 0 {
			t.Fatal(table)
		}
	}
}

func TestIncompatibleFormat(t *testing.T) {
	dir := t.TempDir()
	raw, err := sql.Open("sqlite", filepath.Join(dir, "envden.sqlite"))
	check(t, err)
	_, err = raw.Exec("PRAGMA user_version=2")
	check(t, err)
	check(t, raw.Close())
	if _, err = CreateSqliteStorageAdapter(dir, 0); !e.Is(err, "INVALID_INPUT") {
		t.Fatal(err)
	}
}

func TestAtomicLoginAndLimits(t *testing.T) {
	db := open(t, t.TempDir())
	v, id := []byte{1}, []byte{2}
	key := a.SessionKey{Kind: a.SessionLogin, Device: id, Purpose: "unlock"}
	check(t, db.ConfigureVault(v, a.StoredVault{Active: true}, nil, nil))
	check(t, db.PutSession(v, key, []byte{9}, 0))
	charge, err := db.Charge(v, a.RateBucket{Kind: "member", Device: id}, 0)
	check(t, err)
	err = db.Transaction(func() error {
		_, err := db.ConsumeSession(v, key, 1)
		if err != nil {
			return err
		}
		if err = db.PutDevice(v, id, a.StoredDevice{UnlockedUntil: 100, FreshUntil: 50, ClientVersion: "1.0.0"}); err != nil {
			return err
		}
		if _, err = db.Refund(charge.Receipt, 1); err != nil {
			return err
		}
		return errors.New("Login rejected")
	})
	if err == nil {
		t.Fatal("rollback succeeded")
	}
	b, err := db.Session(v, key, 1)
	check(t, err)
	if b == nil {
		t.Fatal("session consumed")
	}
	device, err := db.Device(v, id)
	check(t, err)
	if device != nil {
		t.Fatal("device persisted")
	}
	refunded, err := db.Refund(charge.Receipt, 1)
	check(t, err)
	if !refunded {
		t.Fatal("refund persisted")
	}
	now := int64(0)
	for strike := 0; strike < 10; strike++ {
		for attempt := 0; attempt < 5; attempt++ {
			charge, err := db.Charge(v, a.RateBucket{Kind: "non-member"}, now)
			check(t, err)
			if charge.Kind != "charged" {
				t.Fatal(charge)
			}
		}
		duration := min(int64(86400000), int64(900000)<<strike)
		charge, err := db.Charge(v, a.RateBucket{Kind: "non-member"}, now+1)
		check(t, err)
		if charge.Kind != "locked" || charge.Until != now+duration {
			t.Fatal(charge)
		}
		now += duration
	}
}

func TestConcurrentCAS(t *testing.T) {
	dir := t.TempDir()
	first := open(t, dir)
	second := open(t, dir)
	check(t, first.ConfigureVault([]byte{1}, a.StoredVault{Active: true}, nil, nil))
	var wg sync.WaitGroup
	results := make(chan a.CommitKind, 2)
	for i, db := range []*storage{first, second} {
		wg.Go(func() {
			n := byte(i + 2)
			r, err := db.CommitSwap([]byte{1}, nil, a.StoredSwap{Header: a.StoredHeader{StoredObject: a.StoredObject{Hash: []byte{n}, Bytes: []byte{n}}, Seq: 1}, BodyDigest: []byte{n}}, 0)
			if err != nil {
				t.Error(err)
			}
			results <- r.Kind
		})
	}
	wg.Wait()
	close(results)
	counts := map[a.CommitKind]int{}
	for kind := range results {
		counts[kind]++
	}
	if counts[a.Committed] != 1 || counts[a.HeadMovedResult] != 1 {
		t.Fatal(counts)
	}
}
