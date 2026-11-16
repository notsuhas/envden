package enginetest

import (
	"encoding/json"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/links/place"
	"github.com/notsuhas/envden/go/cli/settings"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/cli/sync/local/files"
	"github.com/notsuhas/envden/go/core/adapters"
	e "github.com/notsuhas/envden/go/core/errors"
	fakeplace "github.com/notsuhas/envden/go/testing/placement"
	fakerepo "github.com/notsuhas/envden/go/testing/repo"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestModeSwitchesPreserveBases(t *testing.T) {
	f := localFixture(t)
	a := f.first
	c := f.checkout
	f.write(filepath.Join(c.Root, ".env"), "A=1")
	f.write(filepath.Join(c.Root, "Dockerfile"), "FROM scratch")
	rules := adapters.EnvFileRules{Include: []string{".env"}, Exclude: []string{}, ExtraSkipped: []string{"generated"}}
	raw, err := json.Marshal(map[string]any{"include": rules.Include, "exclude": rules.Exclude, "extraSkipped": rules.ExtraSkipped})
	must(t, err)
	_, err = settings.SetConfig(f.ctx, "env-files", string(raw), a.Home, a.Timing, false)
	must(t, err)
	repo := a.Repo
	a.Repo = fakerepo.CreateFakeRepoAdapter(fakerepo.Operations{CheckoutAt: repo.CheckoutAt, CaseInsensitive: repo.CaseInsensitive, EnsureIgnored: repo.EnsureIgnored, EnvFiles: func(_ adapters.Checkout, options *adapters.EnvFileRules) ([]string, error) {
		if options == nil || !reflect.DeepEqual(*options, rules) {
			t.Fatal(options, rules)
		}
		return []string{".env"}, nil
	}})
	s := state.EmptyState("test")
	opts := place.LinkOptions{Copy: true, Approve: func(adapters.Checkout) (bool, error) { return true, nil }}
	_, err = place.LinkCheckout(f.ctx, a, s, c, opts)
	must(t, err)
	equal(t, s.Links[0].Mode, "copy")
	info, err := os.Lstat(filepath.Join(c.Root, ".env"))
	must(t, err)
	equal(t, info.Mode()&os.ModeSymlink != 0, false)
	config, err := settings.ReadConfig(a.Home)
	must(t, err)
	equal(t, placementSetting(config, c.Root), "copy")
	_, err = settings.SetCheckoutPlacement(f.ctx, a, filepath.Join(c.Root, "nested"), "link")
	must(t, err)
	opts.Copy = false
	_, err = place.LinkCheckout(f.ctx, a, s, c, opts)
	must(t, err)
	equal(t, s.Links[0].Mode, "link")
	store := s.Links[0].Store
	f.write(files.BasePath(a.Home, store), "A=1")
	_, err = settings.SetCheckoutPlacement(f.ctx, a, c.Root, "copy")
	must(t, err)
	_, err = place.LinkCheckout(f.ctx, a, s, c, opts)
	must(t, err)
	equal(t, f.read(files.BasePath(a.Home, store, c.Root)), "A=1")
	_, err = settings.SetCheckoutPlacement(f.ctx, a, c.Root, "link")
	must(t, err)
	_, err = place.LinkCheckout(f.ctx, a, s, c, opts)
	must(t, err)
	info, err = os.Lstat(filepath.Join(c.Root, ".env"))
	must(t, err)
	equal(t, info.Mode()&os.ModeSymlink != 0, true)
}
func TestUnavailableLinksNeedExplicitCopyConsent(t *testing.T) {
	for _, interactive := range []bool{false, true} {
		t.Run(map[bool]string{false: "noninteractive", true: "interactive"}[interactive], func(t *testing.T) {
			f := localFixture(t)
			a := f.first
			original := a.Placement
			a.Placement = func(mode adapters.PlacementMode, root string) adapters.Placement {
				p := original(mode, root)
				return fakeplace.CreateFakePlacementAdapter(fakeplace.Operations{Mode: mode, Inspect: p.Inspect, Place: p.Place, Remove: p.Remove, Supported: func(string) (bool, error) { return false, nil }})
			}
			_, err := checkout.SupportedPlacement(f.ctx, a, f.root, false, func(string) (bool, error) { return false, nil }, interactive)
			if !e.Is(err, e.InvalidInput) {
				t.Fatal(err)
			}
			config, err := settings.ReadConfig(a.Home)
			must(t, err)
			equal(t, placementSetting(config, f.root), "")
			if interactive {
				p, err := checkout.SupportedPlacement(f.ctx, a, f.root, false, func(string) (bool, error) { return true, nil }, true)
				must(t, err)
				equal(t, p.Mode(), adapters.PlacementCopy)
				config, err = settings.ReadConfig(a.Home)
				must(t, err)
				equal(t, placementSetting(config, f.root), "copy")
			}
		})
	}
}
func TestPrunePreservesUnavailableVolumesAndBases(t *testing.T) {
	for _, unavailable := range []bool{true, false} {
		t.Run(map[bool]string{true: "unavailable", false: "removed"}[unavailable], func(t *testing.T) {
			f := localFixture(t)
			s := state.EmptyState("test")
			root := filepath.Join(f.root, "removed")
			if unavailable {
				root = filepath.Join(f.root, "unmounted", "repo")
			}
			store := filepath.Join(f.root, "store")
			s.Approved = []state.Checkout{{Root: root, RepoID: "host/repo", GitDir: filepath.Join(root, ".git")}}
			s.Links = []state.Link{{Root: root, Path: ".env", Store: store, Mode: "copy"}}
			base := files.BasePath(f.first.Home, store, root)
			f.write(base, string([]byte{1}))
			must(t, place.PruneMissingCheckouts(f.ctx, f.first.Home, s, func(string) {}, f.first.Timing))
			count := 0
			if unavailable {
				count = 1
			}
			equal(t, len(s.Approved), count)
			equal(t, len(s.Links), count)
			equal(t, readValue(base).present, unavailable)
			if unavailable {
				equal(t, f.read(base), string([]byte{1}))
			}
		})
	}
}

func placementSetting(c settings.Config, root string) string {
	if c.Placement == nil {
		return ""
	}
	v, _ := c.Placement.Get(root).(string)
	return v
}
