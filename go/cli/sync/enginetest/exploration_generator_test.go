package enginetest

import (
	"encoding/json"
	"fmt"
	"os"
	"reflect"
	"testing"
)

func TestSeededExplorationMatchesTS(t *testing.T) {
	raw, err := os.ReadFile("testdata/random-traces.json")
	must(t, err)
	var expected []struct{ Layout, Tokens []string }
	must(t, json.Unmarshal(raw, &expected))
	generated := randomTraces(600)
	equal(t, len(generated), len(expected))

	for i, want := range expected {
		equal(t, generated[i].Label, fmt.Sprintf("seed-1-%03d", i))

		if !reflect.DeepEqual(generated[i].Layout, want.Layout) || !reflect.DeepEqual(generated[i].Tokens, want.Tokens) {
			t.Fatal(i, generated[i], want)
		}
	}
}
