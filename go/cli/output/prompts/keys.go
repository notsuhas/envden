package prompts

import (
	"github.com/charmbracelet/bubbles/key"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/huh"
)

func promptKeyMap() *huh.KeyMap {
	keys := huh.NewDefaultKeyMap()
	keys.Quit = key.NewBinding(key.WithKeys("ctrl+c", "esc", "ctrl+d"))
	keys.Confirm.Toggle = key.NewBinding(key.WithKeys("h", "l", "right", "left", " ", "up", "down"))
	keys.Select.Up = key.NewBinding(key.WithKeys("up", "left", "k", "h"))
	keys.Select.Down = key.NewBinding(key.WithKeys("down", "right", "j", "l"))
	keys.Select.Filter.SetEnabled(false)
	keys.Select.HalfPageUp.SetEnabled(false)
	keys.Select.HalfPageDown.SetEnabled(false)
	keys.Select.GotoTop.SetEnabled(false)
	keys.Select.GotoBottom.SetEnabled(false)
	keys.MultiSelect.Up = key.NewBinding(key.WithKeys("up"))
	keys.MultiSelect.Down = key.NewBinding(key.WithKeys("down"))
	keys.MultiSelect.HalfPageUp.SetEnabled(false)
	keys.MultiSelect.HalfPageDown.SetEnabled(false)
	return keys
}

func multiselectNavigation(count int) func(tea.Model, tea.Msg) tea.Msg {
	cursor := 0
	return func(_ tea.Model, msg tea.Msg) tea.Msg {
		pressed, ok := msg.(tea.KeyMsg)
		if !ok || count == 0 {
			return msg
		}
		switch pressed.String() {
		case "up", "left", "k", "h":
			if cursor == 0 {
				cursor = count - 1
				return tea.KeyMsg{Type: tea.KeyEnd}
			}
			cursor--
			return tea.KeyMsg{Type: tea.KeyUp}
		case "down", "right", "j", "l":
			if cursor == count-1 {
				cursor = 0
				return tea.KeyMsg{Type: tea.KeyHome}
			}
			cursor++
			return tea.KeyMsg{Type: tea.KeyDown}
		case "home", "g":
			cursor = 0
		case "end", "G":
			cursor = count - 1
		}
		return msg
	}
}
