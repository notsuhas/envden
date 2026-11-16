package enginetest

import (
	"encoding/json"
	"os"
	"path/filepath"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/links/checkout"
	"github.com/notsuhas/envden/go/cli/links/place"
	"github.com/notsuhas/envden/go/cli/settings"
	state "github.com/notsuhas/envden/go/cli/state/model"
	"github.com/notsuhas/envden/go/core/adapters"
)

func (f *fixture) layout(modes ...string) []state.Link {
	s := f.state(f.second)
	s.Approved = nil
	targets := []adapters.Checkout{}
	config := map[string]string{}

	for i, mode := range modes {
		c := f.checkoutB
		c.Root = filepath.Join(f.root, "round-target-"+string(rune('0'+i)))
		must(f.t, os.MkdirAll(c.Root, 0700))
		targets = append(targets, c)
		s.Approved = append(s.Approved, checkout.ApprovalRecord(c))
		config[c.Root] = mode
	}

	f.repo(&f.second, targets, ".env")
	f.save(f.second, s)
	data, err := json.Marshal(config)
	must(f.t, err)
	_, err = settings.SetConfig(f.ctx, "placement", string(data), f.second.Home, f.second.Timing, false)
	must(f.t, err)
	r := f.pull(f.second)

	if len(f.state(f.second).Links) == 0 {
		f.t.Fatalf("layout placement: %+v", r)
	}

	return f.state(f.second).Links
}

func (f *fixture) track(a *contracts.Adapters, c adapters.Checkout, copy bool, paths ...string) {
	f.repo(a, []adapters.Checkout{c}, paths...)
	s := f.state(*a)
	_, err := place.LinkCheckout(f.ctx, *a, s, c, place.LinkOptions{Copy: copy, Approve: func(adapters.Checkout) (bool, error) { return true, nil }})
	must(f.t, err)
	f.save(*a, s)
}
