package diagnostics

import (
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/jsonvalue"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/settings"
	"github.com/notsuhas/envden/go/cli/updates"
	"os"
	"path/filepath"
)

type Keys struct {
	Location  string `json:"location"`
	OwnerOnly bool   `json:"ownerOnly"`
}
type Shell struct {
	Shell     string `json:"shell"`
	Path      string `json:"path"`
	Installed bool   `json:"installed"`
}
type Report struct {
	Keys      Keys             `json:"keys"`
	Symlinks  bool             `json:"symlinks"`
	Update    updates.Status   `json:"update"`
	Tailscale jsonvalue.Object `json:"tailscale"`
	HTTPS     jsonvalue.Object `json:"https"`
	Shells    []Shell          `json:"shells"`
}

func Doctor(a contracts.Adapters, location settings.Locations) (Report, error) {
	r := Report{Shells: []Shell{}}
	if _, e := settings.EnsurePaths(location.Home); e != nil {
		return r, e
	}
	dir, e := os.MkdirTemp(location.State, "doctor-")
	if e != nil {
		return r, e
	}
	defer os.RemoveAll(dir)
	target := filepath.Join(dir, "target")
	if os.WriteFile(target, nil, 0600) == nil {
		r.Symlinks = os.Symlink(target, filepath.Join(dir, "link")) == nil
	}
	for _, name := range []string{"zsh", "bash", "fish", "powershell"} {
		s := a.Shell(name)
		installed, e := s.Installed()
		if e != nil {
			return r, e
		}
		r.Shells = append(r.Shells, Shell{name, s.RCPath(), installed})
	}
	r.Keys.Location = output.HomePath(a.Home, output.RealHome(a.UserHome))
	r.Keys.OwnerOnly, e = a.Keychain.OwnerOnly()
	if e != nil {
		return r, e
	}
	r.Update = updates.UpdateStatus(a.Home)
	network, e := a.Network.Status()
	if e != nil {
		return r, e
	}
	r.Tailscale = jsonvalue.Object{{Key: "ready", Value: network.Ready}, {Key: "running", Value: network.Running}, {Key: "loggedIn", Value: network.LoggedIn}, {Key: "httpsEnabled", Value: network.HTTPSEnabled}}
	if network.HasHostname {
		r.Tailscale.Set("hostname", network.Hostname)
	}
	if network.Problem != nil {
		r.Tailscale.Set("problem", jsonvalue.Object{{Key: "kind", Value: network.Problem.Kind}, {Key: "message", Value: network.Problem.Message}})
	}
	https, e := a.Network.CheckHTTPSCertificate()
	if e != nil {
		return r, e
	}
	r.HTTPS = jsonvalue.Object{{Key: "kind", Value: "ready"}}
	if !https.Ready && https.Problem != nil {
		r.HTTPS = jsonvalue.Object{{Key: "kind", Value: https.Problem.Kind}, {Key: "message", Value: https.Problem.Message}}
	}
	return r, nil
}
