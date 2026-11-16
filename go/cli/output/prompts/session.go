package prompts

import (
	"errors"
	"io"
	"os"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/huh"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/output/progress"
	"github.com/notsuhas/envden/go/cli/state"
	"golang.org/x/term"
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
	Required              bool
	Validate              func(string) string
}

type session struct {
	input   io.Reader
	output  io.Writer
	shared  *sharedInput
	current *promptInput
}

func New(input io.Reader, output io.Writer) *session {
	return &session{input: input, output: output, shared: newSharedInput(input)}
}

var errCancelled = state.PromptCancelled()

func IsCancel(err error) bool {
	return errors.Is(err, huh.ErrUserAborted) || errors.Is(err, errCancelled)
}

func (t *session) run(field huh.Field, programOptions ...tea.ProgramOption) error {
	keys := promptKeyMap()
	_, confirm := field.(*huh.Confirm)
	reader := t.shared.prompt(confirm)
	switch field.(type) {
	case *huh.Select[string], *huh.MultiSelect[string]:
		reader.menu = true
	}
	t.current = reader
	defer close(reader.done)
	if file, ok := t.input.(*os.File); ok && term.IsTerminal(int(file.Fd())) {
		original, err := term.MakeRaw(int(file.Fd()))
		if err != nil {
			return err
		}
		defer func() { _ = term.Restore(int(file.Fd()), original) }()
	}
	field = field.WithWidth(80)

	err := huh.NewForm(huh.NewGroup(field)).WithProgramOptions(append(programOptions, tea.WithoutSignalHandler())...).WithInput(reader).WithOutput(t.output).
		WithWidth(80).WithKeyMap(keys).WithAccessible(false).WithShowHelp(false).WithShowErrors(true).Run()
	if errors.Is(err, huh.ErrUserAborted) {
		return errCancelled
	}
	return err
}

func (t *session) validate(o PromptOptions) func(string) error {
	return func(v string) error {
		if o.Validate != nil {
			if message := o.Validate(v); message != "" {
				t.current.continueReading()
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
	if o.Required {
		field.Validate(func(v []string) error {
			if len(v) == 0 {
				t.current.continueReading()
				return errors.New("please select at least one option")
			}
			return nil
		})
	}
	err := t.run(field, tea.WithFilter(multiselectNavigation(len(o.Options))))
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
