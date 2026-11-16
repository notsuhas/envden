package lock

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/core/errors"
)

func TestLockAndReentrancy(t *testing.T) {
	home := t.TempDir()
	timing := Timing{Now: func() int64 { return 1800000000000 }}
	path := filepath.Join(home, "state", "write.lock")
	err := WithStateLock(context.Background(), home, timing, func(ctx context.Context) error {
		o := ReadOwner(path)
		if o == nil || o.PID != os.Getpid() || o.Token == "" {
			t.Fatal(o)
		}

		if e := WithStateLock(context.Background(), home, timing, func(context.Context) error { return nil }); !errors.Is(e, errors.Conflict) {
			t.Fatal(e)
		}

		return WithStateLock(ctx, home, timing, func(context.Context) error { return nil })
	})
	if err != nil {
		t.Fatal(err)
	}

	if _, e := os.Lstat(path); !os.IsNotExist(e) {
		t.Fatal(e)
	}
}

func TestReclaimable(t *testing.T) {
	same := `{"host":"h","boot":"a","namespace":"n"}`
	old := Owner{PID: 1, StartedAt: "old", Identity: same, CreatedAt: 0}
	for _, r := range []struct {
		observed Process
		identity string
		now      int64
		want     bool
	}{{Process{Kind: "dead"}, same, 0, true}, {Process{"live", "new"}, same, 0, true}, {Process{"live", "old"}, same, 0, false}, {Process{Kind: "unknown"}, same, 86400000, false}, {Process{Kind: "unknown"}, "", 86399999, false}, {Process{Kind: "unknown"}, "", 86400000, true}, {Process{Kind: "unknown"}, `{"host":"h","boot":"b"}`, 0, true}, {Process{Kind: "dead"}, `{"host":"other","boot":"b"}`, 0, false}} {
		if got := Reclaimable(old, r.observed, r.identity, r.now); got != r.want {
			t.Fatal(r, got)
		}
	}
}

func TestOwnerRejectsLinks(t *testing.T) {
	root := t.TempDir()
	path := filepath.Join(root, "lock")
	if err := os.Mkdir(path, 0700); err != nil {
		t.Fatal(err)
	}

	if err := os.WriteFile(filepath.Join(root, "target"), []byte(`{"pid":1,"startedAt":"a","token":"t","createdAt":0}`), 0600); err != nil {
		t.Fatal(err)
	}

	if err := os.Symlink(filepath.Join(root, "target"), filepath.Join(path, "owner.json")); err != nil {
		t.Fatal(err)
	}

	if ReadOwner(path) != nil {
		t.Fatal("symlink owner accepted")
	}
}

func TestFractionalOwner(t *testing.T) {
	path := t.TempDir()
	raw := `{"pid":1.0,"startedAt":"a","token":"t","createdAt":1794792136609.9294}`
	if err := os.WriteFile(filepath.Join(path, "owner.json"), []byte(raw), 0600); err != nil {
		t.Fatal(err)
	}
	owner := ReadOwner(path)
	if owner == nil || !Reclaimable(*owner, Process{Kind: "unknown"}, "", 1794964936610) {
		t.Fatal(owner)
	}
}
