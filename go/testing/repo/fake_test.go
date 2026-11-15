package repo

import (
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
)

var _ adapters.Repo

func TestStrictFake(t *testing.T) {
	a := CreateFakeRepoAdapter()
	if a.ID() != "fake-repo" {
		t.Fatal(a.ID())
	}
	calls := []func(){func() { _, _ = a.CaseInsensitive("", false) }, func() { _, _ = a.CheckoutAt("") }, func() { _, _ = a.Worktrees(adapters.Checkout{}) }, func() { _, _ = a.Submodules(adapters.Checkout{}) }, func() { _, _ = a.EnvFiles(adapters.Checkout{}, nil) }, func() { _, _ = a.IsIgnored(adapters.Checkout{}, "") }, func() { _ = a.EnsureIgnored(adapters.Checkout{}, "") }}
	for _, call := range calls {
		func() {
			defer func() {
				if recover() == nil {
					t.Fatal("unexpected fake operation accepted")
				}
			}()
			call()
		}()
	}
}
