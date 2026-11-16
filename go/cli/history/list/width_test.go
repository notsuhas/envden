package list

import "testing"

func TestBunStringWidth(t *testing.T) {
	for _, r := range []struct {
		text string
		want int
	}{{"❤️", 2}, {"👨‍👩‍👧", 2}, {"\x1b[31mred\x1b[0m", 3}, {"\a", 0}} {
		if got := stringWidth(r.text); got != r.want {
			t.Errorf("%q = %d", r.text, got)
		}
	}
}
