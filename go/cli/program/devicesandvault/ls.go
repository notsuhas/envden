package devicesandvault

import (
	"strings"
	"unicode/utf16"

	"github.com/notsuhas/envden/go/cli/admin/devices"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/program/command"
	"github.com/notsuhas/envden/go/cli/program/runtime"
)

func deviceListAction(i *command.Invocation) error {
	env, err := runtime.Get(i)
	if err != nil {
		return err
	}

	ds, err := devices.ListDevices(env.Context, env.Adapters, env.Adapters.Now, env.Adapters.Fetcher)
	if err != nil {
		return err
	}

	if yes, _ := i.Values["json"].(bool); yes {
		text, e := output.TerminalJSON(ds)
		if e != nil {
			return e
		}

		return runtime.Print(i, text)
	}

	verbose, _ := i.Values["verbose"].(bool)

	return runtime.Print(i, deviceListText(ds, verbose))
}

func deviceListText(ds []devices.Device, verbose bool) string {
	if len(ds) == 0 {
		return "No devices"
	}

	width := 0
	for _, d := range ds {
		width = max(width, len(utf16.Encode([]rune(d.Name))))
	}

	lines := []string{}
	for _, d := range ds {
		details := []string{}
		mark := " "
		if d.Current {
			mark = "*"
			details = append(details, "this device")
		}

		version := "version unknown"
		if d.Unconfirmed {
			version = "not confirmed yet"
		} else if d.ClientVersion != nil && *d.ClientVersion != "" {
			version = "v" + *d.ClientVersion
		}

		details = append(details, version)
		if d.RecoveryKeyHeld {
			details = append(details, "has held the recovery keys")
		}

		if verbose {
			details = append(details, "id "+d.ID)
		}

		name := d.Name + strings.Repeat(" ", width-len(utf16.Encode([]rune(d.Name))))
		lines = append(lines, strings.TrimRight(mark+" "+name+"  "+strings.Join(details, " · "), " "))
	}

	return output.SanitizeConsole(strings.Join(lines, "\n"))
}
