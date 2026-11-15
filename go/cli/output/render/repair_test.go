package render

import (
	"github.com/notsuhas/envden/go/cli/admin/repair"
	d "github.com/notsuhas/envden/go/core/protocol/codecs/content"
	"testing"
)

func TestRepairText(t *testing.T) {
	for _, r := range []struct {
		result repair.Result
		want   string
	}{{repair.Result{Kind: "missing-reports", Devices: []string{"laptop"}}, "Waiting for laptop to run envden server repair.\nRun it on each, or finish without them using --without <device>; they rejoin as new devices."}, {repair.Result{Kind: "missing-blobs", Lost: []d.FileName{{RepoId: "repo", Path: ".env"}}}, "No device has the newest version of repo/.env.\nCheck those files, then finish with --accept-lost to use the newest older version."}, {repair.Result{Kind: "finished"}, "Server restore finished"}} {
		if got := RepairText(r.result); got != r.want {
			t.Fatal(got)
		}
	}
}
