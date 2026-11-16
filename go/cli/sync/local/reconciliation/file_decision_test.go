package reconciliation

import (
	"reflect"
	"testing"

	"github.com/notsuhas/envden/go/cli/sync/local/reconciliation/content"
)

func TestFileDecisionCopyCases(t *testing.T) {
	a, b, c := []byte{1}, []byte{2}, []byte{3}

	for _, tc := range []struct {
		name        string
		value, base []byte
		tracked     bool
		mode        string
		want        content.Local
	}{
		{"copy unchanged follows store", a, a, true, "copy", content.Local{Kind: "content", Bytes: b}},
		{"copy edit conflicts with unpushed store", c, a, true, "copy", content.Local{Kind: "conflict", Variants: [][]byte{b, c}}},
		{"untracked bytes conflict", c, a, false, "copy", content.Local{Kind: "conflict", Variants: [][]byte{b, c}}},
		{"unbased bytes conflict", c, nil, true, "copy", content.Local{Kind: "conflict", Variants: [][]byte{b, c}}},
		{"detached bytes conflict", c, a, true, "link", content.Local{Kind: "conflict", Variants: [][]byte{b, c}}},
		{"tracked detached revert is an edit", a, b, true, "link", content.Local{Kind: "content", Bytes: a}},
		{"tracked detached new bytes are an edit", c, b, true, "link", content.Local{Kind: "content", Bytes: c}},
		{"matching detached bytes relink", b, a, true, "link", content.Local{Kind: "content", Bytes: b}},
		{"untracked detached bytes require a choice", a, b, false, "link", content.Local{Kind: "conflict", Variants: [][]byte{b, a}}},
		{"missing copy restores", nil, a, true, "copy", content.Local{Kind: "content", Bytes: b}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result := DeriveFileDecision(FileInput{ContentInput: ContentInput{Previous: a, Recorded: b, Server: b}, StoreBeforeRestore: b, Store: b, Tracked: true, Published: true, Copies: []content.Copy{{Bytes: tc.value, Base: tc.base, Tracked: tc.tracked, Mode: tc.mode}}})

			if !reflect.DeepEqual(result.Local, tc.want) {
				t.Fatalf("%+v != %+v", result.Local, tc.want)
			}
		})
	}
}

func TestFileDecisionConflictOwnership(t *testing.T) {
	a, b, c := []byte{1}, []byte{2}, []byte{3}

	for _, tc := range []struct {
		name                              string
		store, recorded, previous, server []byte
		deleting                          bool
		mine, theirs                      []byte
	}{
		{"store edit is mine", b, a, a, a, false, b, c},
		{"pending removal is mine", nil, a, a, a, true, nil, c},
		{"synced store leaves copy edit as mine", b, b, b, b, false, c, b},
	} {
		t.Run(tc.name, func(t *testing.T) {
			result := DeriveFileDecision(FileInput{ContentInput: ContentInput{Recorded: tc.recorded, Previous: tc.previous, Server: tc.server}, StoreBeforeRestore: tc.store, Store: tc.store, Tracked: true, Published: true, Deleting: tc.deleting, Copies: []content.Copy{{Bytes: c, Base: a, Tracked: true, Mode: "copy"}}})
			want := content.Local{Kind: "conflict", Variants: [][]byte{tc.mine, tc.theirs}}

			if !reflect.DeepEqual(result.Local, want) {
				t.Fatalf("%+v != %+v", result.Local, want)
			}
		})
	}
}

func TestFileDecisionCopyAlreadyAtServer(t *testing.T) {
	a, b, c := []byte{1}, []byte{2}, []byte{3}
	result := DeriveFileDecision(FileInput{ContentInput: ContentInput{Previous: a, Recorded: a, Server: b}, StoreBeforeRestore: a, Store: a, Tracked: true, Published: true, Copies: []content.Copy{{Bytes: b, Base: c, Tracked: true, Mode: "copy"}}})

	if result.Action.Kind != "write" || !same(result.Action.Next, b) {
		t.Fatal(result)
	}
}

func TestFileDecisionRestoredStoreKeepsCopyMine(t *testing.T) {
	a, b, c := []byte{1}, []byte{2}, []byte{3}
	result := DeriveFileDecision(FileInput{ContentInput: ContentInput{Recorded: a, Previous: a, Server: b}, Store: b, Tracked: true, Published: true, Copies: []content.Copy{{Bytes: c, Base: a, Tracked: true, Mode: "copy"}}})

	if !same(result.Mine, c) {
		t.Fatal(result)
	}
}
