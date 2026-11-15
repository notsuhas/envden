package render

import (
	"github.com/notsuhas/envden/go/cli/admin/repair"
	"github.com/notsuhas/envden/go/cli/output"
	"strings"
)

func RepairText(r repair.Result) string {
	lines := []string{}
	switch r.Kind {
	case "missing-reports":
		lines = []string{"Waiting for " + strings.Join(r.Devices, ", ") + " to run envden server repair.", "Run it on each, or finish without them using --without <device>; they rejoin as new devices."}
	case "missing-blobs":
		names := []string{}
		for _, f := range r.Missing {
			names = append(names, f.RepoId+"/"+f.Path)
		}
		if len(names) > 0 {
			lines = append(lines, "Waiting for uploads of "+strings.Join(names, ", ")+".", "Run envden server repair on the devices that have them, then finish again.")
		}
		names = nil
		for _, f := range r.Lost {
			names = append(names, f.RepoId+"/"+f.Path)
		}
		if len(names) > 0 {
			lines = append(lines, "No device has the newest version of "+strings.Join(names, ", ")+".", "Check those files, then finish with --accept-lost to use the newest older version.")
		}
	case "finished":
		lines = []string{"Server restore finished"}
		if r.Report != nil && *r.Report != "" {
			lines = append(lines, "", *r.Report)
		}
		if r.ReplaceKit {
			lines = append(lines, "The restored server can't vouch for the current recovery kit; replace it.")
		}
	}
	return output.SanitizeConsole(strings.Join(lines, "\n"))
}
