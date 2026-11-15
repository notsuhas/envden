package report

import (
	"github.com/notsuhas/envden/go/cli/contracts"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/output/prompts"
	"github.com/notsuhas/envden/go/cli/report/content"
	"strings"
)

type Effects struct {
	Env         map[string]string
	Interactive bool
	Argv        []string
	Which       func(string) string
	Choose      func(string, []prompts.Option, string) (string, error)
	Launch      func([]string) error
	Open        func(string) (bool, error)
	Print       func(string)
	OSRelease   string
}

func ReportProblem(err error, a contracts.Adapters, e Effects) {
	if failure := reportProblem(err, a, e); failure != nil && failure.Error() != "Cancelled" {
		e.Print("Couldn't prepare the report.")
	}
}
func reportProblem(err error, a contracts.Adapters, e Effects) error {
	command := ""
	for _, arg := range e.Argv {
		if !strings.HasPrefix(arg, "-") {
			command = arg
			break
		}
	}
	if !DeriveReportOffer(err, command, e.Interactive, e.Env) {
		return nil
	}
	harnesses := DetectHarnesses(e.Which)
	options := []prompts.Option{}
	for _, h := range harnesses {
		options = append(options, prompts.Option{Value: h.ID, Label: "Ask " + h.Name + " to look into it and draft a GitHub issue"})
	}
	options = append(options, prompts.Option{Value: "browser", Label: "Open a pre-filled GitHub issue in the browser"}, prompts.Option{Value: "no", Label: "No"})
	choice, failure := e.Choose("This looks like an envden bug. Report it?", options, "no")
	if failure != nil || choice == "no" {
		return failure
	}
	facts := ReportFacts(a.Home, a.UserHome, err, e.Argv, e.Env, a.Executable, e.OSRelease)
	document := content.ReportDocument(facts)
	path, failure := WriteReport(a.Home, document, a.Now)
	if failure != nil {
		return failure
	}
	e.Print("Report saved to " + output.HomePath(path, a.UserHome))
	logs := []string{}
	for _, f := range facts.Files {
		if f.Exists {
			logs = append(logs, f.Path)
		}
	}
	for _, h := range harnesses {
		if h.ID == choice {
			return e.Launch(LaunchCommand(h, content.AgentPrompt(path, logs)))
		}
	}
	opened, failure := e.Open(content.IssueURL(content.IssueTitle(facts.Args, facts.Failure.Code), document))
	if failure != nil {
		return failure
	}
	if !opened {
		e.Print("Couldn't open a browser. Open " + content.NewIssueURL + " and paste the report.")
	}
	return nil
}
