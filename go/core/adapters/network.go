package adapters

// NetworkProblem names what stops the network adapter, in the network's own terms.
type NetworkProblem struct {
	Kind    string // not-installed | not-running | logged-out | https-disabled | unreadable
	Message string
}

// HTTPSCheck is {kind: "ready"} or a problem.
type HTTPSCheck struct {
	Ready   bool
	Problem *NetworkProblem
}

type NetworkStatus struct {
	Ready        bool
	Running      bool
	LoggedIn     bool
	HTTPSEnabled bool
	Hostname     string
	HasHostname  bool
	Problem      *NetworkProblem
}

// Network is how devices reach the server (DESIGN § Adapters).
type Network interface {
	ID() string
	CheckHTTPSCertificate() (HTTPSCheck, error)
	Status() (NetworkStatus, error)
	// Expose publishes the local server on the same port number of its own.
	Expose(port int) (string, error)
}
