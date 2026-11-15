package onboarding

import (
	"fmt"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/core/errors"
	"io"
)

func hostLocally(a contracts.Adapters, o SetupOptions, p Prompts, stdout io.Writer) (string, string, bool, error) {
	https, err := a.Network.CheckHTTPSCertificate()
	if err != nil {
		return "", "", false, err
	}
	if !https.Ready {
		return "", "", false, errors.New(errors.InvalidInput, https.Problem.Message)
	}
	host := o.HostServer
	if !host && o.Server == "" && p.Interactive {
		host, err = p.Consent("Host the server on this machine? An always-on host is recommended.", false)
		if err != nil {
			return "", "", false, err
		}
	}
	if !host {
		return "", "", false, nil
	}
	token := ""
	if o.SetupToken == "" {
		token, err = a.LocalSetupToken()
		if err != nil {
			return "", "", false, err
		}
	}
	port, err := a.ServerPort()
	if err != nil {
		return "", "", false, err
	}
	if _, err = a.HostServer(port); err != nil {
		return "", "", false, err
	}
	fmt.Fprintln(stdout, "Server installed on this machine")
	address, err := a.Network.Expose(port)
	return address, token, true, err
}
