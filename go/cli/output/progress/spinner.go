package progress

import (
	"fmt"
	"io"
	"os"
	"sync"

	"github.com/charmbracelet/bubbles/spinner"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/notsuhas/envden/go/cli/output"
	"github.com/notsuhas/envden/go/cli/output/progress/input"
)

type Spinner struct {
	mu      sync.Mutex
	input   io.Reader
	output  io.Writer
	program *tea.Program
	done    chan struct{}
}

type message string

type animation struct {
	spinner spinner.Model
	label   string
}

func (m animation) Init() tea.Cmd { return m.spinner.Tick }
func (m animation) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch v := msg.(type) {
	case message:
		m.label = string(v)
	case tea.KeyMsg:
		if v.String() == "ctrl+c" {
			return m, tea.Quit
		}
	default:
		var cmd tea.Cmd
		m.spinner, cmd = m.spinner.Update(msg)
		return m, cmd
	}
	return m, nil
}

func (m animation) View() string { return m.spinner.View() + " " + m.label }

func New(input io.Reader, output io.Writer) *Spinner { return &Spinner{input: input, output: output} }

func (s *Spinner) Start(label string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.program != nil {
		return
	}
	model := animation{spinner: spinner.New(spinner.WithSpinner(spinner.Dot)), label: output.SanitizeTerminal(label)}
	s.program = tea.NewProgram(model, tea.WithInput(s.input), tea.WithOutput(s.output), tea.WithoutSignalHandler())
	s.done = make(chan struct{})
	program, done := s.program, s.done
	go func() { _, _ = program.Run(); close(done) }()
}

func (s *Spinner) Message(label string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.program != nil {
		s.program.Send(message(output.SanitizeTerminal(label)))
	}
}

func (s *Spinner) Stop(label string) { s.finish(label) }
func (s *Spinner) Clear()            { s.finish("") }

func (s *Spinner) finish(label string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.program == nil {
		return
	}
	s.program.Quit()
	<-s.done
	s.program = nil
	if file, ok := s.input.(*os.File); ok {
		input.Discard(file)
	}
	if label != "" {
		_, _ = fmt.Fprintln(s.output, output.SanitizeTerminal(label))
	}
}
