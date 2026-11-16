package prompts

import (
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/huh"
)

type filter func(tea.Model, tea.Msg) tea.Msg

// afterSubmit drops keys that arrive between an accepted Enter and the end of the prompt, so a pasted second line can't join the answer.
func afterSubmit(next filter) filter {
	submitted := false

	return func(model tea.Model, msg tea.Msg) tea.Msg {
		pressed, ok := msg.(tea.KeyMsg)
		if !ok {
			return next(model, msg)
		}

		if submitted {
			if form, isForm := model.(*huh.Form); !isForm || len(form.Errors()) == 0 {
				return nil
			}

			submitted = false
		}

		if pressed.Type == tea.KeyEnter {
			submitted = true
		}

		return next(model, msg)
	}
}

func unfiltered(_ tea.Model, msg tea.Msg) tea.Msg { return msg }
