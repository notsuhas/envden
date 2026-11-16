package enginetest

import (
	"fmt"
	"github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/core/adapters"
	"os"
	"path/filepath"
	"testing"
)

func TestUnpublishedCopyAgreement(t *testing.T) {
	for _, tc := range []struct {
		base                   bool
		stored, copied, agreed value
	}{
		{true, value{"1", true}, value{"1", true}, value{"1", true}},
		{true, value{"store", true}, value{"1", true}, value{"store", true}},
		{true, value{"1", true}, value{"copy", true}, value{"copy", true}},
		{true, value{"store", true}, value{"copy", true}, value{}},
		{true, value{}, value{"1", true}, value{}},
		{true, value{"same", true}, value{"same", true}, value{"same", true}},
		{false, value{"1", true}, value{"1", true}, value{"1", true}},
		{false, value{"store", true}, value{"1", true}, value{}},
		{false, value{"1", true}, value{"copy", true}, value{}},
		{false, value{"store", true}, value{"copy", true}, value{}},
		{false, value{"same", true}, value{"same", true}, value{"same", true}},
	} {
		t.Run(fmt.Sprintf("base=%v,store=%v,copy=%v", tc.base, tc.stored, tc.copied), func(t *testing.T) {
			f := newFixture(t)
			copy := f.checkout
			copy.Root = filepath.Join(f.root, "copy")
			f.write(filepath.Join(f.checkout.Root, ".env.new"), "PORT=1\n")
			f.track(&f.first, f.checkout, false, ".env.new")
			path := filepath.Join(copy.Root, ".env.new")
			f.write(path, "PORT=1\n")
			f.track(&f.first, copy, true, ".env.new")
			f.repo(&f.first, []adapters.Checkout{f.checkout, copy}, ".env.new")
			store := ""
			for _, link := range f.state(f.first).Links {
				if link.Path == ".env.new" {
					store = link.Store
					break
				}
			}
			if !tc.base {
				must(t, os.Remove(files.BasePath(f.first.Home, store, copy.Root)))
			}
			if tc.stored.present {
				f.write(store, "PORT="+tc.stored.text+"\n")
			} else {
				must(t, files.WriteBytes(store, nil, clock))
			}
			f.write(path, "PORT="+tc.copied.text+"\n")
			r := f.pull(f.first)
			if tc.base && !tc.stored.present {
				equal(t, r.Conflicts, 1)
				equal(t, readValue(store), value{})
				equal(t, f.read(path), "PORT="+tc.copied.text+"\n")
				return
			}
			equal(t, r.Conflicts > 0, !tc.agreed.present)
			stored, copied := tc.stored, tc.copied
			if tc.agreed.present {
				stored, copied = tc.agreed, tc.agreed
			}
			equal(t, f.read(store), "PORT="+stored.text+"\n")
			equal(t, f.read(path), "PORT="+copied.text+"\n")
			if r.Conflicts > 0 {
				f.resolve(f.first, ".env.new", "keep-mine")
				f.write(path, "PORT=resolved\n")
				equal(t, f.push(f.first).Kind, "pushed")
				equal(t, f.read(store), "PORT=resolved\n")
			}
		})
	}
}
