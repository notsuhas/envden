package prompts

import (
	"reflect"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/huh"
)

func TestMultiselectNavigation(t *testing.T) {
	for _, row := range []struct {
		keys []tea.KeyMsg
		want string
	}{
		{[]tea.KeyMsg{{Type: tea.KeyLeft}}, "third"},
		{[]tea.KeyMsg{{Type: tea.KeyRight}}, "second"},
		{[]tea.KeyMsg{{Type: tea.KeyUp}}, "third"},
		{[]tea.KeyMsg{{Type: tea.KeyDown}, {Type: tea.KeyDown}, {Type: tea.KeyRight}}, "first"},
		{[]tea.KeyMsg{{Type: tea.KeyRunes, Runes: []rune{'h'}}}, "third"},
		{[]tea.KeyMsg{{Type: tea.KeyRunes, Runes: []rune{'l'}}}, "second"},
		{[]tea.KeyMsg{{Type: tea.KeyCtrlD}, {Type: tea.KeyDown}}, "second"},
	} {
		var value []string
		field := huh.NewMultiSelect[string]().Options(huh.NewOptions("first", "second", "third")...).Value(&value).Filterable(false)
		field.WithKeyMap(promptKeyMap())
		field.Focus()
		filter := multiselectNavigation(3)
		for _, msg := range row.keys {
			field.Update(filter(field, msg))
		}
		field.Update(tea.KeyMsg{Type: tea.KeySpace})
		field.Update(tea.KeyMsg{Type: tea.KeyEnter})
		if !reflect.DeepEqual(value, []string{row.want}) {
			t.Errorf("%v: got %v, want %s", row.keys, value, row.want)
		}
	}
}

func TestSelectIgnoresNativeShortcuts(t *testing.T) {
	for _, row := range []struct {
		keys []tea.KeyMsg
		want string
	}{
		{[]tea.KeyMsg{{Type: tea.KeyEnd}}, "first"},
		{[]tea.KeyMsg{{Type: tea.KeyCtrlD}}, "first"},
		{[]tea.KeyMsg{{Type: tea.KeyRunes, Runes: []rune{'/'}}, {Type: tea.KeyRunes, Runes: []rune{'h'}}}, "third"},
	} {
		value := "first"
		field := huh.NewSelect[string]().Options(huh.NewOptions("first", "second", "third")...).Value(&value)
		field.WithKeyMap(promptKeyMap())
		field.Focus()
		for _, msg := range row.keys {
			field.Update(msg)
		}
		field.Update(tea.KeyMsg{Type: tea.KeyEnter})
		if value != row.want {
			t.Errorf("%v: got %s, want %s", row.keys, value, row.want)
		}
	}
}
