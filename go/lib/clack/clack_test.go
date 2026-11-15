package clack

import (
	"bytes"
	"encoding/json"
	"os"
	"strings"
	"testing"
)

func TestPromptReference(t *testing.T) {
	var fixtures []struct {
		Kind, Keys, Raw string
		Code            int
		Color           bool
		Columns         int
	}
	data, err := os.ReadFile("testdata/golden.json")
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, f := range fixtures {
		var out bytes.Buffer
		terminal := New(strings.NewReader(f.Keys), &out)
		terminal.Color = f.Color
		terminal.ASCII = false
		terminal.Rows = 24
		terminal.Columns = f.Columns
		initial := false
		o := PromptOptions{Message: "Name?", InitialBool: &initial, Options: []Option{{Value: "a", Label: "Alpha"}, {Value: "b", Label: "Beta"}}}
		switch f.Kind {
		case "text":
			_, err = terminal.Text(o)
		case "password":
			_, err = terminal.Password(o)
		case "confirm":
			_, err = terminal.Confirm(o)
		case "select":
			_, err = terminal.Select(o)
		case "multiselect":
			_, err = terminal.Multiselect(o)
		}
		if err != nil && !IsCancel(err) {
			t.Fatal(err)
		}
		// PTYs translate line feeds to CRLF; the port writes the same pre-terminal bytes.
		want := strings.ReplaceAll(f.Raw, "\r\n", "\n")
		if out.String() != want {
			t.Errorf("%s keys %q\ngot  %q\nwant %q", f.Kind, f.Keys, out.String(), want)
		}
	}
}
