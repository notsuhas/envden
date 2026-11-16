package prompts

import (
	"bufio"
	"io"
	"os"
	"sync"
	"unicode/utf8"
)

type sharedInput struct {
	mu     sync.Mutex
	reader *bufio.Reader
}

type promptInput struct {
	shared  *sharedInput
	confirm bool
	menu    bool
	paused  bool
	resume  chan struct{}
	done    chan struct{}
}

var stdinInput = &sharedInput{reader: bufio.NewReader(os.Stdin)}

func newSharedInput(input io.Reader) *sharedInput {
	if input == os.Stdin {
		return stdinInput
	}
	return &sharedInput{reader: bufio.NewReader(input)}
}

func (s *sharedInput) prompt(confirm bool) *promptInput {
	return &promptInput{shared: s, confirm: confirm, resume: make(chan struct{}, 1), done: make(chan struct{})}
}

func (p *promptInput) continueReading() {
	select {
	case p.resume <- struct{}{}:
	default:
	}
}

func (p *promptInput) Read(buffer []byte) (int, error) {
	if p.paused {
		select {
		case <-p.done:
			return 0, io.EOF
		case <-p.resume:
			p.paused = false
		}
	}
	select {
	case <-p.done:
		return 0, io.EOF
	default:
	}
	p.shared.mu.Lock()
	defer p.shared.mu.Unlock()
	if p.menu && len(buffer) >= utf8.UTFMax {
		first, err := p.shared.reader.Peek(1)
		if err != nil {
			return 0, err
		}
		if first[0] >= 32 && first[0] != 127 {
			r, _, err := p.shared.reader.ReadRune()
			if err != nil {
				return 0, err
			}
			return utf8.EncodeRune(buffer, r), nil
		}
	}
	n := 0
	for n < len(buffer) {
		b, err := p.shared.reader.ReadByte()
		if err != nil {
			if n > 0 {
				return n, nil
			}
			return 0, err
		}
		buffer[n] = b
		n++
		if b == '\r' || b == '\n' || b == 3 || (p.confirm && (b == 'y' || b == 'n' || b == 'Y' || b == 'N')) || (b == 27 && p.shared.reader.Buffered() == 0) {
			p.paused = true
			break
		}
		if p.shared.reader.Buffered() == 0 {
			break
		}
	}
	return n, nil
}
