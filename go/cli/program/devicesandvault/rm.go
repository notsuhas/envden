package devicesandvault

import (
	"fmt"
	"strings"

	"github.com/notsuhas/envden/go/cli/admin/devices"
	"github.com/notsuhas/envden/go/cli/admin/recovery"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/output/prompts"
	"github.com/notsuhas/envden/go/cli/program/runtime"
	"github.com/notsuhas/envden/go/lib/commander"
)

func deviceRemoveAction(i *commander.Invocation) error {
	env, err := runtime.Get(i)
	if err != nil {
		return err
	}

	a := env.Adapters
	newKit, _ := i.Values["newKit"].(bool)
	shown := false
	result, err := devices.RemoveDevice(env.Context, a, i.Args[0], devices.RemoveOptions{Now: a.Now, Fetcher: a.Fetcher, NewKit: newKit, Password: func() (string, error) { return prompts.Secret("Master password") }, Recommend: func() (bool, error) {
		return prompts.Consent("This device held recovery keys. Replace the recovery kit in this removal?", false)
	}, Confirm: func(e devices.Exposure) (bool, error) {
		if err := runtime.Print(i, exposureText(e)); err != nil {
			return false, err
		}

		return prompts.Consent("Remove this device?", false)
	}, OnKit: func(kit recovery.ReplacementKit) error {
		if err := removalKit(i, kit); err != nil {
			return err
		}

		shown = true

		return nil
	}})
	if err != nil {
		if shown {
			_, _ = fmt.Fprintln(runtime.Writer(i.Command, true), "envden: The new recovery kit is not confirmed yet. Keep the old kit too, and rerun this command to finish.")
		}

		return err
	}

	if result.Kind == "finished" {
		return runtime.Print(i, "Finished an interrupted removal; the recovery kit it showed is now active")
	}

	return runtime.Print(i, "Device removed")
}

func exposureText(e devices.Exposure) string {
	lines := []string{"This device couldn't read any env files."}
	if len(e.Files) > 0 {
		lines = []string{"This device could read:"}
		for _, f := range e.Files {
			lines = append(lines, "  "+f.RepoID+"/"+f.Path+": "+strings.Join(f.Keys, ", "))
		}

		lines = append(lines, "It may have kept copies, so change these values where they're issued.")
	}

	if e.Incomplete {
		lines = append(lines, "Some history couldn't be read, so this list may be incomplete.")
	}

	return output.SanitizeConsole(strings.Join(lines, "\n"))
}
