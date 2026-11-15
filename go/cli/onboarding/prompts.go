package onboarding

import (
	"io"
	"strings"

	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/core/errors"
	"github.com/notsuhas/envden/go/lib/clack"
)

type Prompts struct {
	Terminal    *clack.Terminal
	Interactive bool
	Stderr      io.Writer
}

func (p Prompts) require(label string) error {
	if !p.Interactive {
		return errors.New(errors.InvalidInput, strings.TrimRight(label, "?:.")+" needs a terminal. Run this command in your own terminal")
	}

	return nil
}

func (p Prompts) Secret(label string, check func(string) string) (string, error) {
	if err := p.require(label); err != nil {
		return "", err
	}

	return p.Terminal.Password(clack.PromptOptions{Message: output.SanitizeTerminal(label), Validate: func(v string) string {
		if v == "" {
			return "Required"
		}

		if check != nil {
			return check(v)
		}

		return ""
	}})
}

func (p Prompts) Input(label, initial string, required bool, check func(string) string) (string, error) {
	if err := p.require(label); err != nil {
		return "", err
	}

	return p.Terminal.Text(clack.PromptOptions{Message: output.SanitizeTerminal(label), InitialValue: initial, Validate: func(v string) string {
		if v == "" {
			if required {
				return "Required"
			}

			return ""
		}

		if check != nil {
			return check(v)
		}

		return ""
	}})
}

func (p Prompts) Consent(label string, initial bool) (bool, error) {
	if err := p.require(label); err != nil {
		return false, err
	}

	return p.Terminal.Confirm(clack.PromptOptions{Message: output.SanitizeTerminal(label), InitialBool: &initial})
}
