package clack

import (
	"bufio"
	"errors"
	"github.com/notsuhas/envden/go/lib/clack/internal/raw"
	"golang.org/x/term"
	"io"
	"os"
	"strings"
)

var Cancelled = errors.New("clack:cancel")

func IsCancel(err error) bool { return errors.Is(err, Cancelled) }

type Option struct {
	Value, Label, Hint string
	Disabled           bool
}
type PromptOptions struct {
	Message, InitialValue, Placeholder string
	InitialValues                      []string
	InitialBool                        *bool
	Options                            []Option
	Required                           bool
	Validate                           func(string) string
}
type prompt struct {
	terminal                       *Terminal
	options                        PromptOptions
	kind, state, value, validation string
	cursor, index                  int
	yes                            bool
	selected                       map[string]bool
}

func (t *Terminal) Text(options PromptOptions) (string, error) {
	p := t.prompt("text", options)
	err := p.run()
	return p.value, err
}
func (t *Terminal) Password(options PromptOptions) (string, error) {
	p := t.prompt("password", options)
	err := p.run()
	return p.value, err
}
func (t *Terminal) Confirm(options PromptOptions) (bool, error) {
	p := t.prompt("confirm", options)
	err := p.run()
	return p.yes, err
}
func (t *Terminal) Select(options PromptOptions) (string, error) {
	p := t.prompt("select", options)
	err := p.run()
	if len(options.Options) == 0 {
		return "", err
	}
	return options.Options[p.index].Value, err
}
func (t *Terminal) Multiselect(options PromptOptions) ([]string, error) {
	p := t.prompt("multiselect", options)
	err := p.run()
	var result []string
	for _, o := range options.Options {
		if p.selected[o.Value] {
			result = append(result, o.Value)
		}
	}
	return result, err
}
func (t *Terminal) prompt(kind string, o PromptOptions) *prompt {
	p := &prompt{terminal: t, options: o, kind: kind, state: "initial", value: o.InitialValue, cursor: len([]rune(o.InitialValue)), yes: true, selected: map[string]bool{}}
	if o.InitialBool != nil {
		p.yes = *o.InitialBool
	}
	for i, option := range o.Options {
		if option.Value == o.InitialValue {
			p.index = i
		}
	}
	for _, value := range o.InitialValues {
		p.selected[value] = true
	}
	return p
}
func (p *prompt) run() error {
	t := p.terminal
	if f, ok := t.Input.(*os.File); ok && term.IsTerminal(int(f.Fd())) {
		state, err := raw.Make(int(f.Fd()))
		if err != nil {
			return err
		}
		defer term.Restore(int(f.Fd()), state)
	}
	r := renderer{terminal: t}
	r.render(p.frame())
	p.state = "active"
	input := bufio.NewReader(t.Input)
	for {
		key, _, err := input.ReadRune()
		if err != nil {
			if err == io.EOF {
				p.state = "cancel"
				r.render(p.frame())
				t.write("\n\x1b[?25h")
				return Cancelled
			}
			return err
		}
		p.state = "active"
		switch key {
		case 3, 4, 27:
			if key == 27 {
				next, err := input.ReadByte()
				if err == nil && next == '[' {
					var sequence strings.Builder
					for {
						code, err := input.ReadByte()
						if err != nil {
							break
						}
						sequence.WriteByte(code)
						if code >= 64 && code <= 126 {
							break
						}
					}
					switch sequence.String() {
					case "A", "D":
						p.navigate(-1)
					case "B", "C":
						p.navigate(1)
					case "H", "1~":
						p.cursor = 0
					case "F", "4~":
						p.cursor = len([]rune(p.value))
					case "3~":
						runes := []rune(p.value)
						if p.cursor < len(runes) {
							p.value = string(append(runes[:p.cursor], runes[p.cursor+1:]...))
						}
					}

					break
				}
			}
			p.state = "cancel"
		case '\r':
			if p.options.Validate != nil {
				p.validation = p.options.Validate(p.value)
			}
			if p.validation != "" {
				p.state = "error"
			} else if p.kind == "multiselect" && p.options.Required && len(p.selected) == 0 {
				p.validation = "Please select at least one option."
				p.state = "error"
			} else {
				p.state = "submit"
			}
		case '\n':
		case 127, 8:
			runes := []rune(p.value)
			if p.cursor > 0 {
				p.value = string(append(runes[:p.cursor-1], runes[p.cursor:]...))
				p.cursor--
			}
		case ' ':
			if p.kind == "multiselect" && len(p.options.Options) > 0 {
				value := p.options.Options[p.index].Value
				if p.selected[value] {
					delete(p.selected, value)
				} else {
					p.selected[value] = true
				}
			} else if p.kind == "confirm" {
				p.yes = !p.yes
			} else if p.kind == "text" || p.kind == "password" {
				p.insert(key)
			}
		default:
			if p.kind == "confirm" && strings.ContainsRune("yYnN", key) {
				p.yes = key == 'y' || key == 'Y'
				t.write(move(-1) + "\n\x1b[?25h")
				p.state = "submit"
				r.render(p.frame())
				t.write("\n")
				return nil
			}
			if p.kind == "text" || p.kind == "password" {
				if key >= 32 {
					p.insert(key)
				}
			} else {
				switch key {
				case 'j', 'l', '\t':
					p.navigate(1)
				case 'k', 'h':
					p.navigate(-1)
				}
			}
		}
		r.render(p.frame())
		if p.state == "submit" || p.state == "cancel" {
			t.write("\n\x1b[?25h")
			if p.state == "cancel" {
				return Cancelled
			}
			return nil
		}
	}
}
