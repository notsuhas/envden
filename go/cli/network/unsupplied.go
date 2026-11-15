package network

import (
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/core/errors"
)

type unsupplied struct{}

func UnsuppliedNetwork() adapters.Network                  { return unsupplied{} }
func (unsupplied) ID() string                              { return "unsupplied" }
func (unsupplied) Status() (adapters.NetworkStatus, error) { return adapters.NetworkStatus{}, refuse() }
func (unsupplied) CheckHTTPSCertificate() (adapters.HTTPSCheck, error) {
	return adapters.HTTPSCheck{}, refuse()
}
func (unsupplied) Expose(int) (string, error) { return "", refuse() }
func refuse() error                           { return errors.New(errors.Internal, "No network adapter was supplied") }
