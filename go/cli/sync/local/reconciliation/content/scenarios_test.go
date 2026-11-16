package content

import (
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func TestNamedSideScenarios(t *testing.T) {
	raw, err := os.ReadFile("testdata/sides.json")
	if err != nil {
		t.Fatal(err)
	}
	var cases [][]any
	if err = json.Unmarshal(raw, &cases); err != nil {
		t.Fatal(err)
	}
	text := func(v any) string {
		if v == nil {
			return ""
		}
		return v.(string)
	}
	for _, tc := range cases {
		t.Run(tc[0].(string), func(t *testing.T) {
			store, recorded, previous, server, copy, base := text(tc[1]), text(tc[2]), text(tc[3]), text(tc[4]), text(tc[5]), text(tc[6])
			pending := tc[7].(bool)
			want := text(tc[8])
			remote := Server{Kind: server}
			if server != "absent" && server != "tombstone" {
				remote = Server{Kind: "live", Bytes: value(server)}
			}
			result := DeriveFileSides(SidesInput{StoreBeforeRestore: value(store), Recorded: value(recorded), Previous: value(previous), Server: remote, PendingRemoval: pending, Copies: []Copy{{Bytes: value(copy), Base: value(base), Tracked: true, Mode: "copy", Historical: base == "" && copy != "" && copy == previous}}})
			if pending && store != "" {
				t.Fatal("unreachable removal")
			}
			if !same(result.Mine, value(want)) || reference(store, recorded, previous, copy, base, server, pending) != want {
				t.Fatal(result, want)
			}
		})
	}
}
func verifyRetainedSides(t *testing.T, result Sides, store, recorded, previous, copy, base string, remote Server) {
	t.Helper()
	if !reflect.DeepEqual(result.Theirs, remote) {
		t.Fatal("server side changed")
	}
	observed := recorded
	if observed == "" {
		observed = previous
	}
	unsettled := ""
	if store != "" && !(base == store && copy != "" && copy != base) && (store != observed || store != previous) {
		unsettled = store
	}
	copied := ""
	baseline := base
	if baseline == "" {
		baseline = previous
	}
	if copy != "" && copy != baseline {
		copied = copy
	}
	saved := [][]byte{result.Mine}
	if result.Local.Kind == "conflict" {
		saved = append(saved, result.Local.Variants...)
	}
	for _, edit := range []string{unsettled, copied} {
		if edit == "" || remote.Kind == "live" && edit == string(remote.Bytes) {
			continue
		}
		found := false
		for _, v := range saved {
			if string(v) == edit {
				found = true
			}
		}
		if !found {
			t.Fatal("local edit not retained", edit)
		}
	}
	if result.Local.Kind == "conflict" && remote.Kind != "absent" && same(result.Mine, remote.Bytes) {
		t.Fatal("conflict sides match")
	}
}
func TestChangedStoreOwnershipIgnoresTargetOrder(t *testing.T) {
	copies := []Copy{{Bytes: value("B"), Base: value("A"), Tracked: true, Mode: "copy"}, {Bytes: value("C"), Tracked: true, Mode: "copy"}}
	for _, targets := range [][]Copy{copies, {copies[1], copies[0]}} {
		r := DeriveFileSides(SidesInput{StoreBeforeRestore: value("A"), Server: Server{Kind: "absent"}, Copies: targets})
		if !same(r.Mine, value("A")) {
			t.Fatal(r)
		}
	}
}
