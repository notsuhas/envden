package merge

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

// Fixtures capture every call in the three TS merge test files, using Bun 1.4.0.
func TestBunVectors(t *testing.T) {
	raw, err := os.ReadFile("testdata/bun-vectors.json")
	if err != nil {
		t.Fatal(err)
	}
	var vectors []struct {
		Op     string
		Args   []json.RawMessage
		Result json.RawMessage
	}
	if err = json.Unmarshal(raw, &vectors); err != nil {
		t.Fatal(err)
	}
	extra, err := os.ReadFile("testdata/bun-bytes.json")
	if err != nil {
		t.Fatal(err)
	}
	var more []struct {
		Op     string
		Args   []json.RawMessage
		Result json.RawMessage
	}
	if err := json.Unmarshal(extra, &more); err != nil {
		t.Fatal(err)
	}
	vectors = append(vectors, more...)
	for i, v := range vectors {
		var got any
		b := func(n int) []byte { var x []byte; _ = json.Unmarshal(v.Args[n], &x); return x }
		s := func(n int) string { var x string; _ = json.Unmarshal(v.Args[n], &x); return x }
		switch v.Op {
		case "merge":
			got = MergeEnv(b(0), b(1), b(2))
		case "parse":
			got = ParseEnv(b(0))
		case "diff":
			got = DiffEnvKeys(b(0), b(1))
		case "mark":
			var labels Labels
			_ = json.Unmarshal(v.Args[3], &labels)
			got = MarkConflicts(b(0), b(1), b(2), labels)
		case "detect":
			var want bool
			_ = json.Unmarshal(v.Result, &want)
			if HasConflictMarkers(b(0)) != want {
				t.Fatalf("vector %d detect", i)
			}
			continue
		case "validate":
			got = ValidateValue(s(0), s(1), s(2), s(3))
		case "select":
			var entries [3]*Entry
			for n := range entries {
				_ = json.Unmarshal(v.Args[n+1], &entries[n])
			}
			selected := selectEntry(s(0), entries[0], entries[1], entries[2])
			var want struct {
				Kind, Reason, Key string
				Changed           bool
				Entry             *Entry
			}
			_ = json.Unmarshal(v.Result, &want)
			if selected.Kind != want.Kind || selected.Reason != want.Reason || selected.changed != want.Changed || !reflect.DeepEqual(selected.entry, want.Entry) {
				t.Fatalf("vector %d select: %+v != %+v", i, selected, want)
			}
			continue
		}
		var want Result
		if err := json.Unmarshal(v.Result, &want); err != nil {
			t.Fatal(err)
		}
		result := got.(Result)
		if !reflect.DeepEqual(result, want) {
			t.Fatalf("vector %d %s:\ngot %+v\nwant %+v", i, v.Op, result, want)
		}
	}
}
