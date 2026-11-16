package clack

import (
	"strings"
	"sync"
	"time"
)

type Spinner struct {
	mu                sync.Mutex
	Manual            bool
	stop              chan struct{}
	block             *inputBlock
	terminal          *Terminal
	message           string
	frame, tick       int
	running, rendered bool
}

func (t *Terminal) Spinner() *Spinner { return &Spinner{terminal: t} }

func (s *Spinner) Interval() time.Duration {
	if s.terminal.ASCII {
		return 120 * time.Millisecond
	}

	return 80 * time.Millisecond
}

func (s *Spinner) Start(message string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.running {
		return
	}
	s.running = true
	s.frame = 0
	s.tick = 0
	s.rendered = false
	s.message = strings.TrimRight(message, ".")
	s.block = s.terminal.block(func() { s.Stop("Canceled") })
	s.terminal.write(s.terminal.style("gray", s.terminal.sym("│", "|")) + "\n")
	if !s.Manual {
		s.stop = make(chan struct{})
		go s.animate(s.stop)
	}
}

func (s *Spinner) Message(message string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.message = strings.TrimRight(message, ".")
}

func (s *Spinner) Tick() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.running {
		return
	}
	t := s.terminal
	if s.rendered {
		t.write("\x1b[1G\x1b[J")
	}
	frames := []string{"◒", "◐", "◓", "◑"}
	if t.ASCII {
		frames = []string{"•", "o", "O", "0"}
	}
	t.write(t.style("magenta", frames[s.frame]) + "  " + s.message + strings.Repeat(".", min(s.tick/8, 3)))
	s.frame = (s.frame + 1) % 4
	s.tick++
	if s.tick > 32 {
		s.tick = 0
	}
	s.rendered = true
}

func (s *Spinner) Stop(message string) { s.finish(message, false) }

func (s *Spinner) Clear() { s.finish("", true) }

func (s *Spinner) finish(message string, clear bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.running {
		return
	}
	s.running = false
	if s.stop != nil {
		close(s.stop)
		s.stop = nil
	}
	s.block.stop()

	t := s.terminal
	if s.rendered {
		t.write("\x1b[1G\x1b[J")
	}
	if !clear {
		t.write(t.style("green", t.sym("◇", "o")) + "  " + message + "\n")
	}
	s.block.restore()
	s.block = nil
}

func (s *Spinner) animate(stop <-chan struct{}) {
	ticker := time.NewTicker(s.Interval())
	defer ticker.Stop()
	for {
		select {
		case <-stop:
			return
		case <-ticker.C:
			s.Tick()
		}
	}
}
