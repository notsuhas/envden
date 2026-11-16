package textcase

import (
	"encoding/json"
	"os"
	"testing"
)

func TestJavaScriptCaseMapping(t *testing.T) {
	data, err := os.ReadFile("testdata/case.json")
	if err != nil {
		t.Fatal(err)
	}
	var rows []struct{ Text, Lower, Upper string }
	if err = json.Unmarshal(data, &rows); err != nil {
		t.Fatal(err)
	}
	for _, row := range rows {
		if got := Lower(row.Text); got != row.Lower {
			t.Errorf("lower %q = %q, want %q", row.Text, got, row.Lower)
		}
		if got := Upper(row.Text); got != row.Upper {
			t.Errorf("upper %q = %q, want %q", row.Text, got, row.Upper)
		}
	}
}
