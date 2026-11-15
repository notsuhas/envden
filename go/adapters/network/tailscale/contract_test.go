package tailscale

import (
	"encoding/json"
	stderrors "errors"
	"os"
	"testing"

	"github.com/notsuhas/envden/go/core/adapters"
	suite "github.com/notsuhas/envden/go/testing/network"
)

func fixture(t *testing.T) string {
	t.Helper()
	b, e := os.ReadFile("testdata/running.json")
	if e != nil {
		t.Fatal(e)
	}

	return string(b)
}

func TestContract(t *testing.T) {
	suite.NetworkContract(t, func(scenario string) adapters.Network {
		return CreateTailscaleNetworkAdapter(func(args []string) (CommandResult, error) {
			if scenario == "not-installed" {
				return CommandResult{}, stderrors.New("Command unavailable")
			}
			if args[0] == "serve" {
				if args[1] == "status" {
					out := "{}"
					if scenario == "address-taken" {
						out = `{"TCP":{"8080":{"TCPForward":"127.0.0.1:22"}}}`
					}

					return CommandResult{Stdout: out}, nil
				}
				code := 0
				if scenario == "publish-failed" {
					code = 1
				}

				return CommandResult{ExitCode: code}, nil
			}
			if scenario == "unreadable" {
				return CommandResult{Stdout: "bad json"}, nil
			}
			var m map[string]any
			if e := json.Unmarshal([]byte(fixture(t)), &m); e != nil {
				t.Fatal(e)
			}
			switch scenario {
			case "not-running":
				m["BackendState"] = "Stopped"
			case "logged-out":
				m = map[string]any{"BackendState": "NeedsLogin"}
			case "https-disabled":
				m["CertDomains"] = []string{}
			}
			b, _ := json.Marshal(m)

			return CommandResult{Stdout: string(b)}, nil
		})
	})
}
