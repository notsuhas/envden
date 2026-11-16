package commander

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"reflect"
	"testing"
)

func TestAttachedOptionValues(t *testing.T) {
	data, err := os.ReadFile("testdata/options.json")
	if err != nil {
		t.Fatal(err)
	}
	var rows []struct {
		Args   []string
		Stderr string
		Code   int
		Values map[string]any
		Acted  bool
	}
	if err = json.Unmarshal(data, &rows); err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		var stderr bytes.Buffer
		acted, hooked := false, false
		p := New("demo").Option("-y, --yes", "").Option("--no-open", "").Option("-m, --maybe [value]", "").Action(func(*Invocation) error { acted = true; return nil })
		p.Stderr = &stderr
		p.Hook("preAction", func(*Command, *Command) error { hooked = true; return nil })
		invocation, err := p.Parse(row.Args)
		code := 0
		var exit *ExitError
		if errors.As(err, &exit) {
			code = exit.ExitCode
		} else if err != nil {
			t.Fatal(err)
		}
		if code != row.Code || stderr.String() != row.Stderr || acted != row.Acted || hooked != row.Acted {
			t.Errorf("%v: code %d stderr %q acted %v hooked %v, want %+v", row.Args, code, stderr.String(), acted, hooked, row)
		}
		if row.Acted && !reflect.DeepEqual(invocation.Values, row.Values) {
			t.Errorf("%v: got %v want %v", row.Args, invocation.Values, row.Values)
		}
	}
}
