package network

import "github.com/notsuhas/envden/go/core/adapters"

type Operations struct {
	ID                    string
	Status                func() (adapters.NetworkStatus, error)
	CheckHTTPSCertificate func() (adapters.HTTPSCheck, error)
	Expose                func(port int) (string, error)
}

type fake struct{ operations Operations }

func CreateFakeNetworkAdapter(operations ...Operations) adapters.Network {
	var o Operations
	if len(operations) > 0 {
		o = operations[0]
	}

	return &fake{o}
}

func (a *fake) ID() string {
	if a.operations.ID != "" {
		return a.operations.ID
	}

	return "fake-network"
}

func (a *fake) Status() (adapters.NetworkStatus, error) {
	if a.operations.Status == nil {
		panic("Unexpected fake operation: network.status")
	}

	return a.operations.Status()
}

func (a *fake) CheckHTTPSCertificate() (adapters.HTTPSCheck, error) {
	if a.operations.CheckHTTPSCertificate == nil {
		panic("Unexpected fake operation: network.checkHttpsCertificate")
	}

	return a.operations.CheckHTTPSCertificate()
}

func (a *fake) Expose(port int) (string, error) {
	if a.operations.Expose == nil {
		panic("Unexpected fake operation: network.expose")
	}

	return a.operations.Expose(port)
}
