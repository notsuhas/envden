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
	calls := []func(){func() { _, _ = a.Status() }, func() { _, _ = a.CheckHTTPSCertificate() }, func() { _, _ = a.Expose(0) }}
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
