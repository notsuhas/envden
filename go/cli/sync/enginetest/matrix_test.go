package enginetest

import (
	"path/filepath"
	"strings"
	"testing"
)

func TestFullEngineMatrix(t *testing.T) {
	a, b, c := original, "TOKEN=new\n", "TOKEN=other\n"
	for _, modes := range layouts {
		for _, tc := range []struct {
			name, store, remote, want string
			conflicts                 int
		}{
			{"agreement", a, a, a, 0}, {"local edit", b, a, b, 0}, {"remote edit", a, b, b, 0}, {"same edit", b, b, b, 0}, {"divergence", b, c, b, 1},
		} {
			t.Run(strings.Join(modes, "+")+"/"+tc.name, func(t *testing.T) {
				f := newFixture(t)
				targets := f.layout(modes...)
				f.write(targets[0].Store, tc.store)
				f.write(f.aStore, tc.remote)
				f.push(f.first)
				r := f.pull(f.second)
				equal(t, r.Conflicts, tc.conflicts)
				if tc.name == "remote edit" {
					equal(t, r.Changed, 1)
				}
				equal(t, f.read(targets[0].Store), tc.want)
				if tc.conflicts == 0 {
					for _, target := range targets {
						equal(t, f.read(filepath.Join(target.Root, target.Path)), tc.want)
					}
					equal(t, f.pull(f.second).Changed, 0)
				}
			})
		}
	}
}
func TestFullEngineCopyMatrix(t *testing.T) {
	a, b, c := original, "TOKEN=new\n", "TOKEN=other\n"
	for _, tc := range []struct {
		name, store, copied, remote, want string
		conflicts                         int
	}{
		{"copy edit", a, b, a, b, 0}, {"copy unchanged", b, a, a, b, 0}, {"copy remote advance", a, a, b, b, 0}, {"copy divergent edits", b, c, a, b, 1}, {"copy and remote diverge", a, b, c, a, 1},
	} {
		t.Run(tc.name, func(t *testing.T) {
			f := newFixture(t)
			targets := f.layout("copy", "copy", "link")
			f.write(targets[0].Store, tc.store)
			f.write(filepath.Join(targets[0].Root, ".env"), tc.copied)
			f.write(f.aStore, tc.remote)
			f.push(f.first)
			equal(t, f.pull(f.second).Conflicts, tc.conflicts)
			equal(t, f.read(targets[0].Store), tc.want)
		})
	}
}
