package render

import (
	"testing"

	"github.com/notsuhas/envden/go/cli/settings"
)

func TestSettingsText(t *testing.T) {
	c := settings.Config{UpdateCheck: true, AutoApproveWorktrees: true}
	want := "telemetry: off\nupdate-check: off (set to on; the environment overrides it)\nagent-merge: off\nauto-approve-worktrees: on\nplacement: default\nenv-files: default"
	if got := ConfigText(c, map[string]string{"ENVDEN_NO_UPDATE_CHECK": "1"}); got != want {
		t.Fatal(got)
	}

	period := int64(604800000)
	if UnlockPeriodText(&period) != "unlock-period: 7d" || UnlockPeriodText(nil) != "unlock-period: never" {
		t.Fatal("period")
	}
}
