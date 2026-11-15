package list

import (
	"reflect"
	"testing"
)

func TestVersionChanges(t *testing.T) {
	one, two, three := []byte("A=1\nB=2\n"), []byte("A=1\nB=3\nC=4\n"), []byte("B=3\nC=4\n")
	empty := []string{}
	for _, c := range []struct {
		name     string
		content  [][]byte
		complete bool
		want     []any
	}{
		{"creation", [][]byte{one}, true, []any{KeyChanges{[]string{"A", "B"}, empty, empty}}},
		{"pruned", [][]byte{one}, false, []any{"unknown"}},
		{"edits", [][]byte{three, two, one}, true, []any{KeyChanges{empty, empty, []string{"A"}}, KeyChanges{[]string{"C"}, []string{"B"}, empty}, KeyChanges{[]string{"A", "B"}, empty, empty}}},
		{"deletion", [][]byte{one, nil, one}, true, []any{KeyChanges{[]string{"A", "B"}, empty, empty}, KeyChanges{empty, empty, []string{"A", "B"}}, KeyChanges{[]string{"A", "B"}, empty, empty}}},
		{"broken", [][]byte{[]byte("A=\"unterminated\n"), one}, false, []any{"unparsed", "unknown"}},
	} {
		t.Run(c.name, func(t *testing.T) {
			if got := VersionChanges(c.content, c.complete); !reflect.DeepEqual(got, c.want) {
				t.Fatalf("got %#v, want %#v", got, c.want)
			}
		})
	}
	for state, want := range map[int]string{1: "live", 2: "deleted", 3: "restored", 4: "lost", 0: "live"} {
		if got := VersionKind(state); got != want {
			t.Fatal(state, got, want)
		}
	}
}
