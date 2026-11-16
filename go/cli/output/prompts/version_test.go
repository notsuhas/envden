package prompts

import (
	"bytes"
	"strings"
	"testing"

	"github.com/notsuhas/envden/go/lib/clack"
)

func TestCheckoutVersionChoices(t *testing.T) {
	for _, row := range []struct{ input, want string }{{"\r", "separate"}, {"\x1b[B\r", "store"}} {
		var out bytes.Buffer
		got, err := ChooseVersion(true, clack.New(strings.NewReader(row.input), &out), "/repo/.env")
		if err != nil || got != row.want || !strings.Contains(out.String(), "differs from the synced copy") {
			t.Fatal(got, err, out.String())
		}
	}
	if got, err := ChooseVersion(false, nil, "unused"); err != nil || got != "skip" {
		t.Fatal(got, err)
	}
}
