package prompts

import (
	"bytes"
	"strings"
	"testing"
)

func TestCheckoutVersionChoices(t *testing.T) {
	for _, row := range []struct{ input, want string }{{"\r", "separate"}, {"\x1b[B\r", "store"}} {
		var out bytes.Buffer
		got, err := ChooseVersion(true, New(strings.NewReader(row.input), &out), "/repo/.env")
		if err != nil || got != row.want {
			t.Fatal(got, err, out.String())
		}
	}
	if got, err := ChooseVersion(false, nil, "unused"); err != nil || got != "skip" {
		t.Fatal(got, err)
	}
}
