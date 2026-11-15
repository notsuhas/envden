package shell

import (
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
)

var _ adapters.Shell

func TestStrictFake(t *testing.T) {
	a := CreateFakeShellAdapter()
	if a.ID() != "fake-shell" {
		t.Fatal(a.ID())
	}
	calls := []func(){func() { a.RCPath() }, func() { a.HookSnippet("") }, func() { a.Installed() }, func() { a.Install("") }, func() { a.Uninstall() }}
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
