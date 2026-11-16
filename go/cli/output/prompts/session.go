package prompts

import (
	"errors"
	"io"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/huh"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/output/progress"
	"github.com/notsuhas/envden/go/cli/state"
)

type ITerminal interface {
	Text(PromptOptions) (string, error)
	Password(PromptOptions) (string, error)
	Confirm(PromptOptions) (bool, error)
	Select(PromptOptions) (string, error)
	Multiselect(PromptOptions) ([]string, error)
	Spinner() *progress.Spinner
}

type Option struct{ Value, Label string }

type PromptOptions struct {
	Message, InitialValue string
	InitialValues         []string
	InitialBool           *bool
	Options               []Option
	Validate              func(string) string
}

type session struct {
	input  io.Reader
	output io.Writer
}

func New(input io.Reader, output io.Writer) *session {
	return &session{input: input, output: output}
}

var errCancelled = state.PromptCancelled()

func IsCancel(err error) bool {
	return errors.Is(err, errCancelled)
}

func (t *session) run(field huh.Field, keys ...filter) error {
	next := filter(unfiltered)
	if len(keys) > 0 {
		next = keys[0]
	}

	form := huh.NewForm(huh.NewGroup(field.WithWidth(80))).WithWidth(80).WithKeyMap(promptKeyMap()).WithShowHelp(false).WithShowErrors(true)
	// cancel quits normally: bubbletea treats huh's interrupt as a kill and closes the terminal reader under its read loop
	form.SubmitCmd, form.CancelCmd = tea.Quit, tea.Quit

	program := tea.NewProgram(form, tea.WithInput(t.input), tea.WithOutput(t.output), tea.WithFilter(afterSubmit(next)), tea.WithoutSignalHandler(), tea.WithoutBracketedPaste())
	if _, err := program.Run(); err != nil {
		return err
	}

	if form.State == huh.StateAborted {
		return errCancelled
	}

	return nil
}

func (t *session) validate(o PromptOptions) func(string) error {
	return func(v string) error {
		if o.Validate != nil {
			if message := o.Validate(v); message != "" {
				return errors.New(message)
			}
		}
		return nil
	}
}

func (t *session) text(o PromptOptions, secret bool) (string, error) {
	value := o.InitialValue
	field := huh.NewInput().Title(output.SanitizeTerminal(o.Message)).Value(&value).Validate(t.validate(o))
	if secret {
		field.EchoMode(huh.EchoModePassword)
	}
	err := t.run(field)
	if err == nil {
		answer := value
		if secret {
			answer = strings.Repeat("•", len([]rune(value)))
		}
		t.submitted(o, answer)
	}

	return value, err
}

func (t *session) Text(o PromptOptions) (string, error)     { return t.text(o, false) }
func (t *session) Password(o PromptOptions) (string, error) { return t.text(o, true) }

func (t *session) Confirm(o PromptOptions) (bool, error) {
	value := true
	if o.InitialBool != nil {
		value = *o.InitialBool
	}
	err := t.run(huh.NewConfirm().Title(output.SanitizeTerminal(o.Message)).Value(&value))
	if err == nil {
		answer := "No"
		if value {
			answer = "Yes"
		}
		t.submitted(o, answer)
	}

	return value, err
}

func options(values []Option) []huh.Option[string] {
	result := make([]huh.Option[string], 0, len(values))
	for _, o := range values {
		result = append(result, huh.NewOption(output.SanitizeTerminal(o.Label), o.Value))
	}
	return result
}

func (t *session) Select(o PromptOptions) (string, error) {
	value := o.InitialValue
	err := t.run(huh.NewSelect[string]().Title(output.SanitizeTerminal(o.Message)).Options(options(o.Options)...).Value(&value).Height(fieldHeight(o)))
	if err == nil {
		t.submitted(o, selectedLabels(o.Options, []string{value}))
	}

	return value, err
}

func (t *session) Multiselect(o PromptOptions) ([]string, error) {
	value := append([]string{}, o.InitialValues...)
	field := huh.NewMultiSelect[string]().Title(output.SanitizeTerminal(o.Message)).Options(options(o.Options)...).Value(&value).Filterable(false).Height(fieldHeight(o))
	err := t.run(field, multiselectNavigation(len(o.Options)))
	selected := make(map[string]bool, len(value))
	for _, v := range value {
		selected[v] = true
	}
	result := []string{}
	for _, o := range o.Options {
		if selected[o.Value] {
			result = append(result, o.Value)
		}
	}
	if err == nil {
		t.submitted(o, selectedLabels(o.Options, result))
	}

	return result, err
}

func (t *session) Spinner() *progress.Spinner { return progress.New(t.input, t.output) }

// every option stays on screen, as the TS prompts show them all without scrolling
func fieldHeight(o PromptOptions) int {
	return len(o.Options) + 4
}
