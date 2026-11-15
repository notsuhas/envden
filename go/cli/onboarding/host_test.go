package onboarding

import (
	"bytes"
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/host"
	"github.com/notsuhas/envden/go/core/adapters"
	"github.com/notsuhas/envden/go/testing/network"
	"reflect"
	"testing"
)

func TestHostServerUsesInjectedServices(t *testing.T) {
	for _, provided := range []string{"", "provided-token"} {
		calls := []string{}
		var stdout bytes.Buffer
		a := contracts.Adapters{
			Network: network.CreateFakeNetworkAdapter(network.Operations{CheckHTTPSCertificate: func() (adapters.HTTPSCheck, error) {
				calls = append(calls, "https")
				return adapters.HTTPSCheck{Ready: true}, nil
			}, Expose: func(port int) (string, error) {
				if port != 51234 {
					t.Fatal(port)
				}
				calls = append(calls, "expose")
				return "https://host.ts.net:51234", nil
			}}),
			LocalSetupToken: func() (string, error) { calls = append(calls, "token"); return "local-token", nil },
			ServerPort:      func() (int, error) { calls = append(calls, "port"); return 51234, nil },
			HostServer: func(port int) (host.Installed, error) {
				if port != 51234 {
					t.Fatal(port)
				}
				calls = append(calls, "install")
				return host.Installed{}, nil
			},
		}
		address, token, hosted, err := hostLocally(a, SetupOptions{HostServer: true, SetupToken: provided}, Prompts{}, &stdout)
		expected := []string{"https", "port", "install", "expose"}
		wantToken := ""
		if provided == "" {
			expected = []string{"https", "token", "port", "install", "expose"}
			wantToken = "local-token"
		}
		if err != nil || !hosted || address != "https://host.ts.net:51234" || token != wantToken || !reflect.DeepEqual(calls, expected) || stdout.String() != "Server installed on this machine\n" {
			t.Fatal(address, hosted, calls, err)
		}
	}
}
