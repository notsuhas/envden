package prettybytes

import (
	"encoding/json"
	"os"
	"testing"
)

func TestReference(t *testing.T) {
	var fixtures []struct {
		Value  float64
		Binary bool
		Text   string
	}
	data, err := os.ReadFile("testdata/golden.json")
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &fixtures); err != nil {
		t.Fatal(err)
	}
	for _, f := range fixtures {
		if got := Format(f.Value, Options{Binary: f.Binary}); got != f.Text {
			t.Errorf("%g binary=%v: got %q want %q", f.Value, f.Binary, got, f.Text)
		}
	}
}
