package enginetest

import (
	"path/filepath"
	"reflect"
	"testing"

	"github.com/notsuhas/envden/go/cli/links"
	state "github.com/notsuhas/envden/go/cli/state/model"
	syncer "github.com/notsuhas/envden/go/cli/sync"
)

func TestRemovalKeepsOtherLocalOnlyLinks(t *testing.T) {
	f := newFixture(t)
	targets := f.layout("link", "link")
	s := f.state(f.second)

	for i, target := range targets {
		text, choice := "A=shared\n", "store"

		if i == 1 {
			text, choice = "PORT=2\n", "separate"
		}

		f.write(filepath.Join(target.Root, ".env.dev"), text)
		c, err := f.second.Repo.CheckoutAt(target.Root)
		must(t, err)
		_, err = links.LinkFile(f.ctx, f.second, s, *c, f.second.Placement("link", target.Root), ".env.dev", func(string) (string, error) { return choice, nil }, nil)
		must(t, err)
	}

	f.save(f.second, s)
	store := ""

	for _, link := range s.Links {
		if link.Path == ".env.dev" {
			store = link.Store
			break
		}
	}

	r, err := syncer.RemoveFile(f.ctx, f.second, filepath.Join(targets[0].Root, ".env.dev"), syncer.RemoveOptions{Yes: true, Now: clock})
	must(t, err)
	equal(t, r.Publish, "none")
	after := f.state(f.second)
	c, err := f.second.Repo.CheckoutAt(targets[1].Root)
	must(t, err)
	_, err = links.LinkFile(f.ctx, f.second, after, *c, f.second.Placement("link", c.Root), ".env.dev", nil, nil)
	must(t, err)
	matched := []state.Link{}

	for _, link := range after.Links {
		if link.Store == store {
			matched = append(matched, link)
		}
	}

	want := []state.Link{{Root: targets[1].Root, Path: ".env.dev", Store: store, Mode: "copy", LocalOnly: true}}

	if !reflect.DeepEqual(matched, want) {
		t.Fatal(matched, want)
	}

	equal(t, readValue(store).present, false)
	equal(t, f.read(filepath.Join(targets[1].Root, ".env.dev")), "PORT=2\n")
}
