package prompts

import (
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/state"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/lib/clack"
	"golang.org/x/term"
	"os"
	"strings"
)

type Option = clack.Option

func Terminal(message string) error {
	if !term.IsTerminal(int(os.Stdin.Fd())) {
		return errors.New(errors.InvalidInput, strings.TrimRight(message, "?:.")+" needs a terminal. Run this command in your own terminal")
	}
	return nil
}
func answer(value string, err error) (string, error) {
	if clack.IsCancel(err) {
		return "", state.PromptCancelled()
	}
	return value, err
}
func Secret(message string, checks ...func(string) string) (string, error) {
	if e := Terminal(message); e != nil {
		return "", e
	}
	return answer(clack.New(os.Stdin, os.Stdout).Password(clack.PromptOptions{Message: output.SanitizeTerminal(message), Validate: func(v string) string {
		if v == "" {
			return "Required"
		}
		if len(checks) > 0 {
			return checks[0](v)
		}
		return ""
	}}))
}
func Input(message string, required bool, initial string, checks ...func(string) string) (string, error) {
	if e := Terminal(message); e != nil {
		return "", e
	}
	return answer(clack.New(os.Stdin, os.Stdout).Text(clack.PromptOptions{Message: output.SanitizeTerminal(message), InitialValue: initial, Validate: func(v string) string {
		if v == "" && required {
			return "Required"
		}
		if v != "" && len(checks) > 0 {
			return checks[0](v)
		}
		return ""
	}}))
}
func Consent(message string, initial bool) (bool, error) {
	if e := Terminal(message); e != nil {
		return false, e
	}
	v, e := clack.New(os.Stdin, os.Stdout).Confirm(clack.PromptOptions{Message: output.SanitizeTerminal(message), InitialBool: &initial})
	if clack.IsCancel(e) {
		e = state.PromptCancelled()
	}
	return v, e
}
func Choose(message string, options []Option, initial string) (string, error) {
	if e := Terminal(message); e != nil {
		return "", e
	}
	safe := append([]Option(nil), options...)
	for i := range safe {
		safe[i].Label = output.SanitizeTerminal(safe[i].Label)
	}
	return answer(clack.New(os.Stdin, os.Stdout).Select(clack.PromptOptions{Message: output.SanitizeTerminal(message), InitialValue: initial, Options: safe}))
}
func ChooseMany(message string, options []Option) ([]string, error) {
	if e := Terminal(message); e != nil {
		return nil, e
	}
	initial := []string{}
	safe := append([]Option(nil), options...)
	for i := range safe {
		initial = append(initial, safe[i].Value)
		safe[i].Label = output.SanitizeTerminal(safe[i].Label)
	}
	v, e := clack.New(os.Stdin, os.Stdout).Multiselect(clack.PromptOptions{Message: output.SanitizeTerminal(message), InitialValues: initial, Options: safe})
	if clack.IsCancel(e) {
		e = state.PromptCancelled()
	}
	return v, e
}
func ShellChoice() (string, error) {
	return Choose("Install the shell notice? It prints a line when you cd into a checkout whose env files need a push or pull", []Option{{Value: "zsh", Label: "zsh"}, {Value: "bash", Label: "bash"}, {Value: "fish", Label: "fish"}, {Value: "powershell", Label: "PowerShell"}, {Value: "none", Label: "No, skip it"}}, "")
}
func ChooseResolution(path string) (string, error) {
	return Choose(output.SanitizeTerminal(path)+" differs from the server's copy", []Option{{Value: "keep-mine", Label: "Keep mine"}, {Value: "take-server", Label: "Take the server's"}, {Value: "merge", Label: "Merge both"}}, "")
}
