package enginetest

import (
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/sync/local/lineage"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPushAndStatusHeldBackReasons(t *testing.T) {
	for _, failure := range []string{"placement", "conflict", "inspection"} {
		t.Run(failure, func(t *testing.T) {
			f := newFixture(t)
			targets := f.layout("copy", "copy")
			path := filepath.Join(targets[0].Root, ".env")
			if failure == "conflict" {
				f.write(path, "TOKEN=mine\n")
			} else if failure == "inspection" {
				must(t, os.Remove(path))
				must(t, os.Mkdir(path, 0700))
			} else {
				failIgnored(f, targets[1].Root)
			}
			f.write(f.aStore, "TOKEN=server\n")
			f.push(f.first)
			r := f.push(f.second)
			held, err := lineage.HeldBackFiles(f.second, syncLinks(f))
			must(t, err)
			if len(held) == 0 {
				t.Fatal("missing notice")
			}
			for _, notice := range held {
				want := "Held back " + notice.Path + ": " + notice.Reason
				found := false
				for _, report := range r.Reports {
					if report == want {
						found = true
					}
				}
				if !found {
					t.Fatal(want, r.Reports)
				}
			}
		})
	}
}
func TestExcludedLocalEditHeldBack(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	store := f.state(f.second).Links[0].Store
	f.write(store, "TOKEN=excluded\n")
	_, err := settings.SetConfig(f.ctx, "env-files", `{"include":[".env.*"],"exclude":[],"extraSkipped":[]}`, f.second.Home, f.second.Timing, false)
	must(t, err)
	r := f.push(f.second)
	equal(t, r.Changed, 0)
	held, err := lineage.HeldBackFiles(f.second, syncLinks(f))
	must(t, err)
	found := false
	for _, notice := range held {
		if strings.Contains(notice.Reason, "env-files") {
			found = true
		}
	}
	equal(t, found, true)
	reports := strings.Join(r.Reports, "\n")
	if !strings.Contains(reports, "Held back") || !strings.Contains(reports, "env-files") {
		t.Fatal(r.Reports)
	}
	f.pull(f.first)
	equal(t, f.read(f.aStore), original)
	_, err = settings.SetConfig(f.ctx, "env-files", `{"include":[".env",".env.*"],"exclude":[],"extraSkipped":[]}`, f.second.Home, f.second.Timing, false)
	must(t, err)
}
func TestSkippedRemoteContentCannotOverwrite(t *testing.T) {
	f := newFixture(t)
	f.pull(f.second)
	_, err := settings.SetConfig(f.ctx, "env-files", `{"include":[".env.*"],"exclude":[],"extraSkipped":[]}`, f.second.Home, f.second.Timing, false)
	must(t, err)
	f.write(f.aStore, "TOKEN=remote\n")
	f.push(f.first)
	equal(t, f.push(f.second).Changed, 0)
	f.pull(f.first)
	equal(t, f.read(f.aStore), "TOKEN=remote\n")
	_, err = settings.SetConfig(f.ctx, "env-files", `{"include":[".env",".env.*"],"exclude":[],"extraSkipped":[]}`, f.second.Home, f.second.Timing, false)
	must(t, err)
}
