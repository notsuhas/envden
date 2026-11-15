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
	calls := []func(){func() { a.CaseInsensitive("", false) }, func() { a.CheckoutAt("") }, func() { a.Worktrees(adapters.Checkout{}) }, func() { a.Submodules(adapters.Checkout{}) }, func() { a.EnvFiles(adapters.Checkout{}, nil) }, func() { a.IsIgnored(adapters.Checkout{}, "") }, func() { a.EnsureIgnored(adapters.Checkout{}, "") }}
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
