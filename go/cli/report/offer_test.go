package report

import (
	"fmt"
	"github.com/notsuhas/envden/go/core/errors"
	"testing"
)

func TestReportOffer(t *testing.T) {
	for _, r := range []struct {
		err         error
		command     string
		interactive bool
		env         map[string]string
		want        bool
	}{{fmt.Errorf("crash"), "setup", true, nil, true}, {errors.New(errors.InvalidData, "bad"), "setup", true, nil, true}, {fmt.Errorf("crash"), "setup", false, nil, false}, {fmt.Errorf("crash"), "setup", true, map[string]string{"CLAUDECODE": "1"}, false}, {fmt.Errorf("crash"), "setup", true, map[string]string{"ENVDEN_NO_REPORT": "1"}, false}, {errors.New(errors.InvalidInput, "Cancelled"), "setup", true, nil, false}, {errors.New(errors.InvalidInput, "bad"), "setup", true, nil, false}, {errors.New(errors.Conflict, "x"), "pull", true, nil, false}, {errors.New(errors.Conflict, "x"), "setup", true, nil, true}} {
		if got := DeriveReportOffer(r.err, r.command, r.interactive, r.env); got != r.want {
			t.Fatal(r, got)
		}
	}
}
