package reconciliation

import "testing"

func TestContentDecisions(t *testing.T) {
	mine, server, previous := []byte{1}, []byte{2}, []byte{3}
	for _, tc := range []struct {
		name, want string
		change     func(*ContentInput)
	}{
		{"divergent", "choose", func(*ContentInput) {}},
		{"detached", "detached", func(i *ContentInput) { i.Detached = true; i.Previous = server }},
		{"same server", "write", func(i *ContentInput) { i.Previous = server }},
		{"same mine", "write", func(i *ContentInput) { i.Previous = mine }},
		{"agreement", "write", func(i *ContentInput) { i.Mine = server }},
		{"untracked", "conflict", func(i *ContentInput) { i.Linked = false; i.UseStore = false }},
		{"untracked choosing", "choose", func(i *ContentInput) { i.Linked = false; i.UseStore = false; i.Choosing = true }},
		{"repair", "repair-conflict", func(i *ContentInput) { i.Repair = true }},
		{"missing repair", "choose", func(i *ContentInput) { i.Repair = true; i.Mine = nil }},
		{"unbased tombstone", "choose", func(i *ContentInput) { i.Previous = nil; i.Server = nil; i.Tombstone = true }},
		{"observed revert", "conflict", func(i *ContentInput) { i.Recorded = mine; i.Mine = previous }},
	} {
		t.Run(tc.name, func(t *testing.T) {
			input := ContentInput{Linked: true, UseStore: true, Mine: mine, Server: server, Previous: previous}
			tc.change(&input)
			if got := DeriveContentAction(input).Kind; got != tc.want {
				t.Fatalf("%s != %s", got, tc.want)
			}
		})
	}
	for _, mine := range [][]byte{nil, {}, mine} {
		if !same(DeriveDefaultContent(ContentInput{Linked: true, UseStore: true, Mine: mine, Server: server, Previous: server}), mine) {
			t.Fatal("local content not retained")
		}
	}
}

func TestStoreSource(t *testing.T) {
	for _, tc := range []struct {
		mode, status string
		linked, want bool
	}{{"link", "missing", false, true}, {"link", "linked", true, true}, {"link", "linked", false, true}, {"link", "detached", true, false}, {"copy", "missing", true, false}, {"link", "relinkable", false, false}} {
		if got := DeriveStoreSource(tc.mode, tc.status, tc.linked); got != tc.want {
			t.Fatal(tc)
		}
	}
}

func TestConflictRequirements(t *testing.T) {
	for _, tc := range []struct {
		kind                     string
		choosing, detached, want bool
	}{{"conflict", false, false, true}, {"repair-conflict", true, true, true}, {"detached", false, false, true}, {"detached", true, false, false}, {"detached", false, true, false}, {"write", false, false, false}, {"choose", false, false, false}} {
		if got := NeedsConflict(tc.kind, tc.choosing, tc.detached); got != tc.want {
			t.Fatal(tc)
		}
	}
}

func TestFileDecisions(t *testing.T) {
	a, b, c := []byte{1}, []byte{2}, []byte{3}
	for _, tc := range []struct{ store, previous, server, next []byte }{{a, a, a, a}, {a, a, b, b}, {a, b, b, a}, {b, a, b, b}} {
		result := DeriveFileDecision(FileInput{ContentInput: ContentInput{Previous: tc.previous, Server: tc.server}, Store: tc.store, StoreBeforeRestore: tc.store, Tracked: true, Published: true})
		if result.Action.Kind != "write" || !same(result.Action.Next, tc.next) {
			t.Fatal(tc, result)
		}
	}
	result := DeriveFileDecision(FileInput{ContentInput: ContentInput{Previous: b, Server: c}, Store: a, StoreBeforeRestore: a, Tracked: true, Published: true})
	if result.Action.Kind != "choose" {
		t.Fatal(result)
	}
}
