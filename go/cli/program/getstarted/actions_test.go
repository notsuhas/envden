package getstarted

import (
	"reflect"
	"testing"

	"github.com/notsuhas/envden/go/cli/onboarding"
)

func TestMissingSetupFlags(t *testing.T) {
	want := []string{"--server <url> or --host-server", "--telemetry on|off", "--update-check on|off", "--shell zsh|bash|fish|powershell|none", "--agent on|off", "--scan-root <path...>"}
	if got := missingSetupFlags(false, onboarding.SetupOptions{}); !reflect.DeepEqual(got, want) {
		t.Fatal(got)
	}

	for _, row := range []struct {
		interactive bool
		o           onboarding.SetupOptions
	}{{true, onboarding.SetupOptions{}}, {false, onboarding.SetupOptions{Preferences: onboarding.Preferences{Yes: true}}}, {false, onboarding.SetupOptions{Server: "local", Preferences: onboarding.Preferences{Telemetry: "off", UpdateCheck: "on", Shell: "none", Agent: "off"}, ScanRoot: []string{"/repo"}}}} {
		if got := missingSetupFlags(row.interactive, row.o); len(got) != 0 {
			t.Fatal(got)
		}
	}
}
