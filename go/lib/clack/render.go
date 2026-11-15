package clack

import "strings"

type renderer struct {
	terminal *Terminal
	previous string
}

func (r *renderer) render(frame string) {
	t := r.terminal
	frame = wrap(frame, t.Columns)
	if frame == r.previous {
		return
	}
	if r.previous == "" {
		t.write("\x1b[?25l")
		t.write(frame)
		r.previous = frame

		return
	}
	old, next := strings.Split(r.previous, "\n"), strings.Split(frame, "\n")
	var changed []int
	for i := 0; i < max(len(old), len(next)); i++ {
		if i >= len(old) || i >= len(next) || old[i] != next[i] {
			changed = append(changed, i)
		}
	}
	t.write("\x1b[999D" + move(-(len(old) - 1)))
	first := changed[0]
	if len(changed) == 1 {
		t.write(move(first) + "\x1b[2K\x1b[G")
		if first < len(next) {
			t.write(next[first])
		}
		t.write(move(len(next) - first - 1))
	} else {
		t.write(move(first) + "\x1b[J" + strings.Join(next[first:], "\n"))
	}
	r.previous = frame
}
