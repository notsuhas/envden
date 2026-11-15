package network

import (
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
)

var _ adapters.Network

func TestStrictFake(t *testing.T) {
	a := CreateFakeNetworkAdapter()
	if a.ID() != "fake-network" {
		t.Fatal(a.ID())
	}
	calls := []func(){func() { a.Status() }, func() { a.CheckHTTPSCertificate() }, func() { a.Expose(0) }}
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
