package report

import (
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/output/prompts"
)

func TestReportProblemEffects(t *testing.T) {
	home := t.TempDir()
	a := contracts.Adapters{Home: home, UserHome: home, Now: func() int64 { return 0 }, Executable: "/binary"}
	chooseCalls := 0
	printed := []string{}
	effects := Effects{Interactive: false, Argv: []string{"doctor"}, Which: func(string) string { return "" }, Choose: func(_ string, _ []prompts.Option, initial string) (string, error) {
		chooseCalls++
		if initial != "no" {
			t.Fatal(initial)
		}

		return "browser", nil
	}, Print: func(s string) { printed = append(printed, s) }, Open: func(url string) (bool, error) {
		if !strings.Contains(url, "issues/new?") {
			t.Fatal(url)
		}

		return false, nil
	}}
	ReportProblem(fmt.Errorf("boom"), a, effects)
	if chooseCalls != 0 {
		t.Fatal(chooseCalls)
	}

	effects.Interactive = true
	ReportProblem(fmt.Errorf("boom"), a, effects)
	if chooseCalls != 1 || len(printed) != 2 {
		t.Fatal(chooseCalls, printed)
	}

	info, e := os.Stat(home + "/reports/1970-01-01T00-00-00-000Z.md")
	if e != nil || info.Mode().Perm() != 0600 {
		t.Fatal(info, e)
	}
}
