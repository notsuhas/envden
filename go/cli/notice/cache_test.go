package notice

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/notsuhas/envden/go/cli/state/files"
	"github.com/notsuhas/envden/go/cli/state/lock"
	"github.com/notsuhas/envden/go/cli/state/model"
)

func TestNoticeCache(t *testing.T) {
	home := t.TempDir()
	now := func() int64 { return 1800000000000 }
	s := model.EmptyState("test")
	s.Approved = append(s.Approved, model.Checkout{Root: "/repo", RepoID: "github.com/test/repo", GitDir: "/repo/.git"})
	store := filepath.Join(home, "store", ".env")
	if e := files.AtomicWrite(store, []byte("SECRET=never-print\n"), now); e != nil {
		t.Fatal(e)
	}

	s.Links = append(s.Links, model.Link{Root: "/repo", Path: ".env", Store: store, Mode: "link"})
	local, e := NoticeStatus(home, s)
	if e != nil || len(local) != 1 {
		t.Fatal(local, e)
	}

	timing := lock.Timing{Now: now, Delays: []int64{}}
	if e = RefreshNotice(context.Background(), home, s, func(string) (bool, error) { return true, nil }, now, timing); e != nil {
		t.Fatal(e)
	}

	notice, e := CachedNotice(home)
	if e != nil || notice != "envden: github.com/test/repo out of sync\n" {
		t.Fatal(notice, e)
	}

	for _, name := range []string{"approved-checkouts", "approved-checkouts-insensitive"} {
		raw, e := os.ReadFile(filepath.Join(home, "state", name))
		if e != nil || string(raw) != "/repo\n" {
			t.Fatal(string(raw), e)
		}
	}

	s.Links[0].LocalOnly = true
	local, e = NoticeStatus(home, s)
	if e != nil || len(local) != 0 {
		t.Fatal(local, e)
	}
}
