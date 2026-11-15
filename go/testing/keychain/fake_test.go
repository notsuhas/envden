package keychain

import (
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
)

var _ adapters.Keychain

func TestStrictFake(t *testing.T) {
	a := CreateFakeKeychainAdapter()
	if a.ID() != "fake-keychain" {
		t.Fatal(a.ID())
	}
	calls := []func(){func() { _, _ = a.OwnerOnly() }, func() { _, _ = a.Get("", false) }, func() { _ = a.Set("", nil) }, func() { _ = a.Delete("") }}
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
