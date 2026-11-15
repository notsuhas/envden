package network

import (
	"github.com/notsuhas/envden/go/core/errors"
	"testing"
)

func TestUnsupplied(t *testing.T) {
	n := UnsuppliedNetwork()
	if n.ID() != "unsupplied" {
		t.Fatal(n.ID())
	}
	_, a := n.Status()
	_, b := n.CheckHTTPSCertificate()
	_, c := n.Expose(4783)
	for _, e := range []error{a, b, c} {
		if !errors.Is(e, errors.Internal) || e.Error() != "No network adapter was supplied" {
			t.Fatal(e)
		}
	}
}
