package prompts

import (
	"github.com/charmbracelet/bubbles/key"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/huh"
)

type filter func(tea.Model, tea.Msg) tea.Msg

// afterSubmit drops keys that arrive between an accepted Enter and the end of the prompt, so a pasted second line can't join the answer; cancel keys always pass.
func afterSubmit(next filter) filter {
	quit := promptKeyMap().Quit
	submitted := false

	return func(model tea.Model, msg tea.Msg) tea.Msg {
		pressed, ok := msg.(tea.KeyMsg)
		if !ok || key.Matches(pressed, quit) {
			return next(model, msg)
		}

		if submitted {
			if form, _ := model.(*huh.Form); form != nil && len(form.Errors()) == 0 {
				return nil
			}

			submitted = false
		}

		if pressed.String() == "enter" {
			submitted = true
		}

		return next(model, msg)
	}
}

func unfiltered(_ tea.Model, msg tea.Msg) tea.Msg { return msg }
